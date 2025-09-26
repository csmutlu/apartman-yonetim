# Apartman Yönetim Uygulaması

Apartman ve site yönetimini pratikleştiren, yöneticiler ve sakinler için tasarlanmış bir web uygulaması.

Bu uygulamayla neler yapabilirsiniz?

- Aidatlarınızı ve diğer ödemelerinizi tek yerden takip edersiniz. Yönetici yeni bir ödeme talebi oluşturduğunda anında bildirim gelir.
- Her ayın 10’unda, aidatlar otomatik olarak oluşturulur. Böylece kimse “bu ay aidat açıldı mı?” diye düşünmez.
- Gelir-giderlerinizi net bir şekilde görürsünüz. Giderler grafiklerle sunulur; dönemsel karşılaştırmalar yapmak kolaydır.
- Duyurulara anında ulaşır, önemli duyurularda bildirim alırsınız. Son kullanma tarihi geçen duyurular otomatik olarak pasifleşir.
- Arıza/talep (ör. asansör arızası) oluşturabilir, durum değiştikçe bildirim alırsınız. “Beklemede → İşleme Alındı → Tamamlandı” gibi adımları takip edersiniz.
- Yönetici panelinden kullanıcıları, duyuruları, ödemeleri ve arızaları hızlıca yönetirsiniz.

Kısacası; iletişim kopukluklarını azaltan, ödemeleri düzenli hale getiren ve apartman gündemini şeffaflaştıran bir çözüm.

---

## Nasıl Kurulur?

1. Bu depoyu bilgisayarınıza alın veya klonlayın.
2. Ön yüzü başlatın:

```pwsh
cd frontend
# Apartman Yönetim Uygulaması

Apartman ve site yaşamını düzenli, şeffaf ve hızlı hale getiren bir çözüm. Hem yöneticiye hem de sakinlere günlük ihtiyaçları kolaylaştıran pratik bir panel sunar.

## Bu uygulama neyi çözer?

- Aidat ve diğer ödemelerin “takip, hatırlatma ve kayıt” sürecini tek bir yerde toplar.
- Duyuruların kaybolup gitmesini önler; önemli duyurularda bildirim gönderir.
- Arıza/talep süreçlerini görünür kılar; her adımda bilgilendirme yapar.
- Gelir–giderleri anlaşılır grafiklerle gösterir; dönemsel kıyas yapmayı kolaylaştırır.

---

## Kullanıcı (Sakin) Deneyimi

- Bildirimli yaşam: Yeni bir ödeme talebi, önemli bir duyuru veya arıza durum değişikliği olduğunda tarayıcınıza bildirim gelir. “Güncel kaldım mı?” derdi biter.
- Aidat ve Ödemeler: Her ayın 10’unda aidatlar otomatik olarak oluşturulur. “Bu ay açıldı mı?” sorusu tarih olur; siz uygulamada güncel borçlarınızı görürsünüz.
- Ödeme Geçmişi: Yaptığınız ödemeleri, açıklamaları ve tarihleri tek bakışta inceleyebilirsiniz.
- Duyurular: Yönetimin yayınladığı duyurulara anında ulaşırsınız; süresi dolanlar otomatik pasifleşir, liste daima temiz kalır.
- Arıza/Talep: “Asansör çalışmıyor” gibi bir durum mu var? Talep oluşturur, süreç ilerledikçe (Beklemede → İşleme Alındı → Tamamlandı) bildirim alırsınız.

## Yönetici Deneyimi

- Ana Sayfa Özeti: Kasa durumu, toplam gelir–gider, aktif duyuru sayısı, bekleyen arıza, ödenmemiş borç gibi kritik metrikleri tek ekranda görürsünüz.
- Kullanıcı Yönetimi: Sakin ekleme/düzenleme, daire bilgileri ve erişim yönetimi.
- Ödeme İşlemleri: Tek tek veya toplu ödeme talepleri oluşturursunuz. Ödeme onaylandığında sistem ilgili kişiye bildirim gönderir.
- Otomatik Aidat: Her ayın 10’unda sistem sizin yerinize o ayın aidat taleplerini oluşturur. Unutma yok, ekstra iş yok.
- Giderler: Aylık/kalem bazlı giderleri girersiniz. Uygulama bunları grafiklere taşır; “Nereye ne harcandı?” sorusu netleşir.
- Raporlar ve Grafikler: Dönem, kategori veya daire temelinde gelir–gideri görselleştirir. Toplantıya sunulacak veri her zaman elinizin altında.
- Duyurular: Önemli konuları hızla yayınlar, gerekiyorsa son kullanma tarihi verirsiniz; süresi dolunca otomatik pasif olur.
- Arıza Yönetimi: Talepleri sıraya alır, durumlarını güncellersiniz; ilgili sakin her değişiklikte bilgilendirilir.

## Tipik Akışlar

- Aidat Dönemi: 10’unda sistem aidatları açar → kullanıcıların ekranına ve tarayıcısına bildirim düşer → ödemeler tamamlandıkça “onaylandı” bildirimi gider.
- Arıza Bildirimi: Sakin talep oluşturur → yönetici “işleme alındı” der → sorun çözüldüğünde “tamamlandı” bilgisi ve bildirim gider.
- Duyuru: Yönetim yeni duyuru yayınlar → herkes anında görür → tarihi geçtiğinde otomatik pasifleşir.

---

## Ekran Görüntüleri

Not: Görsellerin `frontend/public/` klasöründe bulunması gerekir. Dosya adları farklıysa aşağıdaki yolları kendi dosya adlarınıza göre güncelleyebilirsiniz.

1. Yönetici Paneli – Kasa Durumu ve Özet

  ![Yönetici Paneli – Kasa Durumu](frontend/public/admin-dashboard.png)

2. Kullanıcılar Yönetimi

  ![Kullanıcılar Yönetimi](frontend/public/users.png)

3. Ödeme İşlemleri (Talep Oluşturma)

  ![Ödeme İşlemleri](frontend/public/payments.png)

4. Ödeme Geçmişi

  ![Ödeme Geçmişi](frontend/public/payment-history.png)

5. Raporlar (Gelir–Gider Grafikleri)

  ![Raporlar – Grafikler](frontend/public/reports.png)

6. Duyurular

  ![Duyurular](frontend/public/announcements.png)

7. Giderler

  ![Giderler](frontend/public/expenses.png)

8. Arıza Yönetimi

  ![Arıza Yönetimi](frontend/public/issues.png)

9. Kullanıcı Ana Sayfa

  ![Kullanıcı Ana Sayfa](frontend/public/user-home.png)

10. Kullanıcı Ödemeler

  ![Kullanıcı Ödemeler](frontend/public/user-payments.png)

11. Kullanıcı Duyurular

  ![Kullanıcı Duyurular](frontend/public/user-announcements.png)

---

Projeyi incelemek ve geri bildirim vermek için: https://github.com/csmutlu/apartman-yonetim
```
