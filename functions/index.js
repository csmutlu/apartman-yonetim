//C:\Users\Süleyman\Desktop\apartman_yonetim\functions\index.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");

const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");

const { Timestamp } = require("firebase-admin/firestore");

const REGION = 'europe-west1'; 
setGlobalOptions({
    region: REGION,
    timeoutSeconds: 120, 
    memory: '256MB' 
});

admin.initializeApp();

const db = admin.firestore(); 
const messaging = admin.messaging(); 

async function getUserTokens(userId) {
    const tokens = [];
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        console.warn("getUserTokens: Geçersiz veya boş kullanıcı ID'si sağlandı.");
        return tokens; 
    }

    try {
        const tokensRef = db.collection('users').doc(userId).collection('fcmTokens');
        const tokensSnapshot = await tokensRef.where('active', '==', true).get();

        if (tokensSnapshot.empty) {
            console.log(`getUserTokens: Kullanıcı (${userId}) için aktif token bulunamadı.`);
            return tokens;
        }

        tokensSnapshot.forEach((doc) => {
            const tokenData = doc.data();
            if (tokenData.token && typeof tokenData.token === 'string' && tokenData.token.length >= 100) {
                tokens.push(tokenData.token);
            } else {
                console.warn(`getUserTokens: Kullanıcı (${userId}) için geçersiz token formatı (${doc.id}): ${tokenData.token ? tokenData.token.substring(0, 15) + '...' : 'null/undefined'}`);
            }
        });

        console.log(`getUserTokens: Kullanıcı (${userId}) için ${tokens.length} geçerli token bulundu.`);

    } catch (error) {
        console.error(`getUserTokens: Token alınırken hata oluştu (Kullanıcı: ${userId}):`, error);
    }
    return tokens;
}

async function sendNotificationsAndCleanup(tokens, payload, userIdForCleanup = null) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        console.log(`sendNotificationsAndCleanup: (${userIdForCleanup || 'Toplu Gönderim'}) için gönderilecek token yok.`);
        return { successCount: 0, failureCount: 0, responses: [] }; 
    }
    if (!payload || typeof payload !== 'object' || !payload.notification || typeof payload.notification !== 'object' || !payload.notification.title || !payload.notification.body) {
        console.error("sendNotificationsAndCleanup: Geçersiz payload yapısı.", payload);
        return { successCount: 0, failureCount: tokens.length, error: { code: 'invalid-payload', message: 'Payload notification alanı (title/body) eksik.' }, responses: [] };
    }

    const validTokens = tokens.filter(token => typeof token === 'string' && token.length >= 100);
    if (validTokens.length !== tokens.length) {
        console.warn(`sendNotificationsAndCleanup: ${tokens.length - validTokens.length} geçersiz formatlı token filtrelendi.`);
    }
    if (validTokens.length === 0) {
        console.log(`sendNotificationsAndCleanup: (${userIdForCleanup || 'Toplu Gönderim'}) için gönderilecek geçerli token kalmadı.`);
        return { successCount: 0, failureCount: 0, responses: [] };
    }

    const messages = validTokens.map(token => {
        const stringData = {};
        if (payload.data && typeof payload.data === 'object') {
            for (const key in payload.data) {
                if (Object.hasOwnProperty.call(payload.data, key)) {
                    stringData[key] = payload.data[key] == null ? '' : String(payload.data[key]);
                }
            }
        }

        return {
            token: token,
            notification: {
                title: payload.notification.title,
                body: payload.notification.body,
            },
            data: stringData,
            webpush: {
                fcmOptions: {
                    link: stringData?.click_action || '/' 
                }
            }
        };
    });

    console.log(`sendNotificationsAndCleanup: (${userIdForCleanup || 'Toplu Gönderim'}) ${messages.length} mesaj gönderiliyor...`);

    let response;
    try {
        response = await messaging.sendEach(messages);
        console.log(`sendNotificationsAndCleanup: Sonuç (${userIdForCleanup || 'Toplu Gönderim'}): ${response.successCount} başarılı, ${response.failureCount} başarısız.`);

        if (response.failureCount > 0) {
            const tokensToRemove = new Set(); 
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    const failedToken = validTokens[idx]; 
                    console.error(`sendNotificationsAndCleanup: Token'a (${failedToken ? failedToken.substring(0, 10) + '...' : 'Bilinmeyen'}) gönderme başarısız: ${errorCode || resp.error?.message}`);

                    if (errorCode === "messaging/invalid-registration-token" ||
                        errorCode === "messaging/registration-token-not-registered") {
                        if (failedToken) { 
                            tokensToRemove.add(failedToken);
                        }
                    }
                }
            });

            if (tokensToRemove.size > 0 && userIdForCleanup) {
                console.log(`sendNotificationsAndCleanup: (${userIdForCleanup}) için silinecek ${tokensToRemove.size} geçersiz token bulundu.`);
                const tokensRef = db.collection('users').doc(userIdForCleanup).collection('fcmTokens');
                const deletePromises = [];

                Array.from(tokensToRemove).forEach(tokenToDelete => {
                    deletePromises.push(
                        tokensRef.where('token', '==', tokenToDelete).limit(1).get()
                            .then(snapshot => {
                                if (!snapshot.empty) {
                                    const docRef = snapshot.docs[0].ref;
                                    console.log(`sendNotificationsAndCleanup: Firestore'dan token siliniyor (${userIdForCleanup}): ${docRef.id}`);
                                    return docRef.delete();
                                } else {
                                    console.warn(`sendNotificationsAndCleanup: Firestore'da silinecek token bulunamadı (${userIdForCleanup}): ...${tokenToDelete.slice(-10)}`);
                                    return Promise.resolve(); 
                                }
                            })
                            .catch(tokenDeleteError => {
                                console.error(`sendNotificationsAndCleanup: Firestore token silinirken hata (${userIdForCleanup}, ...${tokenToDelete.slice(-10)}):`, tokenDeleteError);
                            })
                    );
                });

                await Promise.all(deletePromises)
                    .then(() => console.log(`sendNotificationsAndCleanup: (${userIdForCleanup}) ${tokensToRemove.size} token silme işlemi tamamlandı.`))
                    .catch(err => console.error(`sendNotificationsAndCleanup: (${userIdForCleanup}) Token toplu silme hatası:`, err));

            } else if (tokensToRemove.size > 0) {
                console.warn(`sendNotificationsAndCleanup: Toplu gönderimde ${tokensToRemove.size} geçersiz token bulundu, kullanıcı ID'si olmadığı için Firestore temizliği atlandı.`);
            }
        }
    } catch (error) {
        console.error("sendNotificationsAndCleanup: sendEach() genel hatası:", error);
        if (error.code) { console.error(`FCM Hata Kodu: ${error.code}`); }
        return { successCount: 0, failureCount: validTokens.length, error: { code: error.code || 'sendEach-error', message: error.message }, responses: [] };
    }

    return response; 
}

exports.sendPaymentRequestNotification = onDocumentCreated("payments/{paymentId}", async (event) => {
    const paymentData = event.data.data();
    if (!paymentData || !paymentData.user_id) {
        console.log(`PaymentRequest (${event.params.paymentId}): Eksik veri, işlem yok.`);
        return null;
    }
    const userId = paymentData.user_id;

    if (paymentData.is_paid == null || paymentData.is_paid === 0) {
        const tokens = await getUserTokens(userId);
        if (!tokens || tokens.length === 0) {
            console.log(`PaymentRequest (${event.params.paymentId}): Kullanıcı (${userId}) için token yok.`);
            return null;
        }

        const amount = (paymentData.amount || 0).toLocaleString("tr-TR", { style: 'currency', currency: 'TRY' });
        const type = paymentData.type || "Ödeme";
        const payload = {
            notification: {
                title: "Yeni Ödeme Talebi 💰",
                body: `${amount} tutarındaki ${type} ödemeniz oluşturuldu.`
            },
            data: {
                notification_type: 'payment_request',
                related_id: String(event.params.paymentId),
                click_action: '/user/payments'
            }
        };
        console.log(`PaymentRequest (${event.params.paymentId}): Bildirim gönderiliyor -> ${userId}`);
        return sendNotificationsAndCleanup(tokens, payload, userId);
    }
    console.log(`PaymentRequest (${event.params.paymentId}): Zaten ödenmiş, işlem yok.`);
    return null;
});

exports.sendPaymentConfirmationNotification = onDocumentUpdated("payments/{paymentId}", async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    if (!beforeData || !afterData || !afterData.user_id) {
        console.log(`PaymentConfirm (${event.params.paymentId}): Eksik veri, işlem yok.`);
        return null;
    }
    const userId = afterData.user_id;

    if ((beforeData.is_paid == null || beforeData.is_paid === 0) && afterData.is_paid === 1) {
        const tokens = await getUserTokens(userId);
        if (!tokens || tokens.length === 0) {
            console.log(`PaymentConfirm (${event.params.paymentId}): Kullanıcı (${userId}) için token yok.`);
            return null;
        }

        const amount = (afterData.amount || 0).toLocaleString("tr-TR", { style: 'currency', currency: 'TRY' });
        const type = afterData.type || "Ödeme";
        const payload = {
            notification: {
                title: "Ödeme Onayı ✅",
                body: `${amount} tutarındaki ${type} ödemeniz alındı.`
            },
            data: {
                notification_type: 'payment_confirmation',
                related_id: String(event.params.paymentId),
                click_action: '/user/payments'
            }
        };
        console.log(`PaymentConfirm (${event.params.paymentId}): Bildirim gönderiliyor -> ${userId}`);
        return sendNotificationsAndCleanup(tokens, payload, userId);
    }
    return null;
});

exports.sendIssueUpdateNotification = onDocumentUpdated("issues/{issueId}", async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    if (!beforeData || !afterData || !afterData.user_id) {
        console.log(`IssueUpdate (${event.params.issueId}): Eksik veri, işlem yok.`);
        return null;
    }
    const userId = afterData.user_id;

    if (beforeData.status !== afterData.status) {
        const tokens = await getUserTokens(userId);
        if (!tokens || tokens.length === 0) {
            console.log(`IssueUpdate (${event.params.issueId}): Kullanıcı (${userId}) için token yok.`);
            return null;
        }

        const issueTitle = afterData.title || "Talebiniz";
        let statusText = 'güncellendi';
        switch(afterData.status) {
            case 'beklemede': statusText = 'Beklemede'; break;
            case 'ilgileniliyor': statusText = 'İşleme Alındı'; break;
            case 'tamamlandi': statusText = 'Tamamlandı'; break;
            default: statusText = afterData.status || 'güncellendi'; 
        }

        const payload = {
            notification: {
                title: "Arıza Durumu Güncellendi 🛠️",
                body: `"${issueTitle}" başlıklı talebinizin durumu '${statusText}' olarak güncellendi.`
            },
            data: {
                notification_type: 'issue_update',
                related_id: String(event.params.issueId),
                click_action: '/user/issues'
            }
        };
        console.log(`IssueUpdate (${event.params.issueId}): Bildirim gönderiliyor -> ${userId}`);
        return sendNotificationsAndCleanup(tokens, payload, userId);
    }
    return null;
});

exports.sendAnnouncementNotification = onDocumentCreated("announcements/{announcementId}", async (event) => {
    const announcementData = event.data.data();

    if (!announcementData || announcementData.is_active !== 1) {
        console.log(`Announcement (${event.params.announcementId}): Aktif değil.`);
        return null;
    }
    const expiryDate = announcementData.expiry_date?.toDate();
    if (expiryDate && expiryDate < new Date()) {
        console.log(`Announcement (${event.params.announcementId}): Süresi dolmuş.`);
        return null;
    }

    console.log(`Announcement (${event.params.announcementId}): Bildirim hazırlanıyor.`);
    const title = announcementData.title || "Yeni Duyuru";
    const content = announcementData.content || "";
    const body = content.length > 100 ? content.substring(0, 97) + "..." : content;

    const payload = {
        notification: { title: `${title} 📢`, body: body },
        data: {
            notification_type: 'announcement',
            related_id: String(event.params.announcementId),
            click_action: '/user/announcements'
        }
    };

    try {
        const usersRef = db.collection("users");
        const q = usersRef.where("role", "==", "user"); 
        const usersSnapshot = await q.get();

        if (usersSnapshot.empty) {
            console.log("Announcement: Bildirim gönderilecek kullanıcı bulunamadı.");
            return null;
        }

        const tokenPromises = usersSnapshot.docs.map(userDoc => getUserTokens(userDoc.id));
        const allTokensNested = await Promise.all(tokenPromises);
        const uniqueTokens = [...new Set(allTokensNested.flat())]; 

        if (uniqueTokens.length === 0) {
            console.log("Announcement: Gönderilecek geçerli token yok.");
            return null;
        }

        console.log(`Announcement: ${uniqueTokens.length} tekil token'a gönderiliyor...`);
        const MAX_TOKENS_PER_BATCH = 500;
        const sendPromises = [];

        for (let i = 0; i < uniqueTokens.length; i += MAX_TOKENS_PER_BATCH) {
            const batchTokens = uniqueTokens.slice(i, i + MAX_TOKENS_PER_BATCH);
            sendPromises.push(sendNotificationsAndCleanup(batchTokens, payload, null)); 
        }

        const results = await Promise.all(sendPromises);
        const totalSuccess = results.reduce((sum, r) => sum + (r?.successCount || 0), 0);
        const totalFailure = results.reduce((sum, r) => sum + (r?.failureCount || 0), 0);
        console.log(`Announcement: Gönderim tamamlandı: ${totalSuccess} başarılı, ${totalFailure} başarısız.`);

        await db.collection("notification_logs").add({
            type: "announcement", related_id: event.params.announcementId, sent_at: Timestamp.now(),
            target: "all_users", success_count: totalSuccess, failure_count: totalFailure,
            title: payload.notification.title,
        });

    } catch (error) {
        console.error("Announcement: Bildirim işlenirken hata:", error);
    }

    return null;
});

exports.deactivateExpiredAnnouncements = onSchedule("every day 00:00", async (context) => {
    console.log("DeactivateExpiredAnnouncements: Süresi dolan duyurular kontrol ediliyor...");
    
    try {
        const now = Timestamp.now();
        
        const expiredAnnouncementsQuery = db.collection("announcements")
            .where("is_active", "==", 1)
            .where("expiry_date", "<", now);
            
        const expiredAnnouncementsSnapshot = await expiredAnnouncementsQuery.get();
        
        if (expiredAnnouncementsSnapshot.empty) {
            console.log("DeactivateExpiredAnnouncements: Süresi dolan aktif duyuru bulunamadı.");
            return null;
        }
        
        const batch = db.batch();
        let count = 0;
        
        expiredAnnouncementsSnapshot.forEach(doc => {
            console.log(`DeactivateExpiredAnnouncements: Duyuru devre dışı bırakılıyor: ${doc.id}`);
            batch.update(doc.ref, { is_active: 0 });
            count++;
        });
        
        await batch.commit();
        console.log(`DeactivateExpiredAnnouncements: ${count} duyurunun aktiflik durumu güncellendi.`);
        
        return { updatedCount: count };
    } catch (error) {
        console.error("DeactivateExpiredAnnouncements: Hata:", error);
        return { error: error.message };
    }
});

exports.cleanupExpiredFcmTokens = onSchedule("every sunday 04:00", async (event) => {
    console.log("CleanupExpiredTokens: İşlem Başladı.");
    const expirationThresholdDays = 90; 
    const now = new Date();
    const expirationDate = new Date(now.getTime() - expirationThresholdDays * 24 * 60 * 60 * 1000);
    const expirationTimestamp = Timestamp.fromDate(expirationDate);
    console.log(`CleanupExpiredTokens: Şundan eski tokenlar silinecek: ${expirationDate.toISOString()}`);

    let totalUsersChecked = 0;
    let totalTokensQueried = 0;
    let totalTokensDeleted = 0;

    try {
        const usersSnapshot = await db.collection('users').get();
        totalUsersChecked = usersSnapshot.size;
        console.log(`CleanupExpiredTokens: ${totalUsersChecked} kullanıcı kontrol edilecek.`);

        if (totalUsersChecked === 0) {
            console.log("CleanupExpiredTokens: Temizlenecek kullanıcı yok.");
            return null;
        }

        const allDeletePromises = []; 

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const tokensRef = userDoc.ref.collection('fcmTokens');
            const q = tokensRef.where('refreshed_at', '<', expirationTimestamp);

            allDeletePromises.push(
                q.get().then(oldTokensSnapshot => {
                    totalTokensQueried += oldTokensSnapshot.size;
                    if (!oldTokensSnapshot.empty) {
                        console.log(`CleanupExpiredTokens: Kullanıcı ${userId} - ${oldTokensSnapshot.size} eski token bulundu.`);
                        const batch = db.batch(); 
                        oldTokensSnapshot.forEach(tokenDoc => {
                            batch.delete(tokenDoc.ref);
                            totalTokensDeleted++;
                        });
                        return batch.commit().catch(err => {
                           console.error(`CleanupExpiredTokens: Batch commit hatası (${userId}):`, err);
                        });
                    }
                    return Promise.resolve(); 
                }).catch(err => {
                    console.error(`CleanupExpiredTokens: Token sorgulama hatası (${userId}):`, err);
                })
            );
        } 

        await Promise.all(allDeletePromises);

        console.log(`CleanupExpiredTokens: İşlem Tamamlandı. ${totalUsersChecked} kullanıcı kontrol edildi, ${totalTokensQueried} eski token sorgulandı, ${totalTokensDeleted} token silme işlemi başlatıldı.`);
        return null; 

    } catch (error) {
        console.error("CleanupExpiredTokens: Genel Hata:", error);
        return { error: `Token temizleme hatası: ${error.message}` }; 
    }
});

exports.createMonthlyFeeRequests = onSchedule("10 9 10 * *", async (context) => {
    console.log("CreateMonthlyFeeRequests: Otomatik aidat talebi oluşturma başladı.");
    
    try {
        const feeDoc = await db.collection("settings").doc("fee").get();
        if (!feeDoc.exists) {
            console.error("CreateMonthlyFeeRequests: Aidat ayarları bulunamadı!");
            return null;
        }
        
        const feeData = feeDoc.data();
        const feeAmount = feeData.amount || 0;
        
        if (feeAmount <= 0) {
            console.error(`CreateMonthlyFeeRequests: Geçersiz aidat tutarı: ${feeAmount}`);
            return null;
        }
        
        console.log(`CreateMonthlyFeeRequests: Aidat tutarı: ${feeAmount} TL`);
        
        const usersSnapshot = await db.collection("users")
            .where("role", "==", "user")
            .get();
        
        if (usersSnapshot.empty) {
            console.log("CreateMonthlyFeeRequests: Aidat talebi oluşturulacak kullanıcı bulunamadı.");
            return null;
        }
        
        const now = Timestamp.now();
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
                              "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        
        const batch = db.batch();
        let requestCount = 0;
        
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const userId = userDoc.id;
            const userName = `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || "Belirsiz Kullanıcı";
            const apartmentNumber = userData.apartment_number || "Bilinmiyor";
            
            const existingPaymentQuery = await db.collection("payments")
                .where("user_id", "==", userId)
                .where("type", "==", "aidat")
                .where("is_paid", "==", 0)
                .get();
            
            let paymentExists = false;
            for (const paymentDoc of existingPaymentQuery.docs) {
                const paymentData = paymentDoc.data();
                const paymentDate = paymentData.created_date?.toDate();
                if (paymentDate && 
                    paymentDate.getMonth() === currentMonth && 
                    paymentDate.getFullYear() === currentYear) {
                    paymentExists = true;
                    break;
                }
            }
            
            if (paymentExists) {
                console.log(`CreateMonthlyFeeRequests: ${userName} (${apartmentNumber}) için bu ay zaten aidat talebi mevcut, atlanıyor.`);
                continue;
            }
            
            const newPaymentRef = db.collection("payments").doc();
            const description = `${monthNames[currentMonth]} ${currentYear} ayı aidat ödemesi`;
            
            batch.set(newPaymentRef, {
                amount: feeAmount,
                apartment_number: apartmentNumber,
                created_date: now,
                description: description,
                is_paid: 0,
                payment_date: null,
                type: "aidat",
                user_id: userId,
                user_name: userName
            });
            
            requestCount++;
            console.log(`CreateMonthlyFeeRequests: ${userName} (${apartmentNumber}) için ${feeAmount} TL aidat talebi oluşturuldu.`);
        }
        
        if (requestCount === 0) {
            console.log("CreateMonthlyFeeRequests: Oluşturulacak yeni aidat talebi bulunmadı.");
            return null;
        }
        
        await batch.commit();
        console.log(`CreateMonthlyFeeRequests: ${requestCount} kullanıcı için aidat talebi oluşturma işlemi başarıyla tamamlandı.`);
        
        await db.collection("logs").add({
            action: "create_monthly_fees",
            timestamp: now,
            details: {
                fee_amount: feeAmount,
                user_count: requestCount,
                month: monthNames[currentMonth],
                year: currentYear
            }
        });
        
        return { success: true, requestCount: requestCount };
    } catch (error) {
        console.error("CreateMonthlyFeeRequests: Hata:", error);
        return { error: error.message };
    }
});

exports.setAdminRole = onCall({ 
    region: REGION 
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'İşlem için giriş yapmalısınız'
    );
  }
  
  const requestingUserSnapshot = await admin.firestore()
    .collection('users')
    .doc(request.auth.uid) 
    .get();
    
  if (!requestingUserSnapshot.exists || requestingUserSnapshot.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Bu işlem için yönetici yetkisine sahip olmalısınız'
    );
  }
  
  const userId = request.data.userId; 
  
  try {
    await admin.auth().setCustomUserClaims(userId, { admin: true });
    return { success: true, message: 'Yönetici rolü başarıyla atandı' };
  } catch (error) {
    console.error('Admin rolü atama hatası:', error);
    throw new functions.https.HttpsError('internal', 'İşlem başarısız: ' + error.message);
  }
});

exports.deleteAuthUser = onCall({ 
    region: REGION 
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'İşlem için giriş yapmalısınız'
    );
  }
  
  const requestingUserSnapshot = await admin.firestore()
    .collection('users')
    .doc(request.auth.uid) 
    .get();
    
  if (!requestingUserSnapshot.exists || requestingUserSnapshot.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Bu işlem için yönetici yetkisine sahip olmalısınız'
    );
  }
  
  const userId = request.data.userId; 
  
  try {
    await admin.auth().deleteUser(userId);
    return { success: true, message: 'Kullanıcı Authentication\'dan silindi' };
  } catch (error) {
    console.error('Auth kullanıcı silme hatası:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
});

exports.updateUserPassword = onCall({ 
    region: REGION 
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'İşlem için giriş yapmalısınız'
    );
  }
  
  const requestingUserSnapshot = await admin.firestore()
    .collection('users')
    .doc(request.auth.uid) 
    .get();
    
  if (!requestingUserSnapshot.exists || requestingUserSnapshot.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Bu işlem için yönetici yetkisine sahip olmalısınız'
    );
  }
  
  const userId = request.data.userId; 
  const newPassword = request.data.newPassword; 
  const currentPassword = request.data.currentPassword; 
  
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Geçerli bir şifre sağlanmalıdır (min 6 karakter)'
    );
  }
  
  try {
    const userRecord = await admin.auth().getUser(userId);
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Kullanıcı Firestore\'da bulunamadı'
      );
    }
    
    const userData = userDoc.data();
    const userEmail = userData.email || `${userData.phone}@apartman-yonetim.com`;
    
    await admin.auth().updateUser(userId, {
      password: newPassword,
    });
    
    return { success: true, message: 'Şifre başarıyla güncellendi' };
  } catch (error) {
    console.error('Şifre güncelleme hatası:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
});

exports.updateUserEmail = onCall({ 
    region: REGION 
}, async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'İşlem için giriş yapmalısınız'
    );
  }
  
  const requestingUserSnapshot = await admin.firestore()
    .collection('users')
    .doc(request.auth.uid) 
    .get();
    
  if (!requestingUserSnapshot.exists || requestingUserSnapshot.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Bu işlem için yönetici yetkisine sahip olmalısınız'
    );
  }
  
  const userId = request.data.userId; 
  const newPhone = request.data.newPhone; 
  
  if (!newPhone || typeof newPhone !== 'string' || newPhone.length !== 10) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Geçerli bir telefon numarası sağlanmalıdır (10 karakter)'
    );
  }
  
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Kullanıcı Firestore\'da bulunamadı'
      );
    }
    
    const newEmail = `${newPhone}@apartman-yonetim.com`;
    
    await admin.auth().updateUser(userId, {
      email: newEmail,
    });
    
    return { success: true, message: 'Email başarıyla güncellendi' };
  } catch (error) {
    console.error('Email güncelleme hatası:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
});