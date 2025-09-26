import React, { createContext, useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  auth,
  db,
  messaging,
  FCM_VAPID_KEY,
  saveTokenToFirestore,
} from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getToken, deleteToken } from "firebase/messaging";

export const UserContext = createContext({
  user: null,
  setUser: () => {},
  loading: true,
  logout: async () => {},
});

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("UserProvider mounted. Setting up auth listener.");
    const storedUser = localStorage.getItem("user");
    if (storedUser && storedUser !== "undefined") {
      try {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser && (parsedUser.id || parsedUser.uid)) {
          parsedUser.id = parsedUser.id || parsedUser.uid;
          parsedUser.uid = parsedUser.uid || parsedUser.id;
          console.log("User loaded from LocalStorage:", parsedUser);
          setUser(parsedUser);
        } else {
          console.warn("Stored user data is invalid. Clearing.");
          localStorage.removeItem("user");
        }
      } catch (e) {
        console.error("LocalStorage user parse error:", e);
        localStorage.removeItem("user");
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log(
        "[Auth Listener] State changed. Firebase User:",
        firebaseUser?.uid || "No user"
      );
      try {
        if (firebaseUser) {
          console.log(
            "[Auth Listener] User logged in. Fetching Firestore data for UID:",
            firebaseUser.uid
          );
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("[Auth Listener] Firestore data found:", userData);
            const appUser = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              phone: userData.phone || "",
              first_name: userData.first_name || "",
              last_name: userData.last_name || "",
              role: userData.role || "user",
              apartment_number: userData.apartment_number || "",
            };
            console.log("[Auth Listener] Setting user context with:", appUser);
            setUser(appUser);
            localStorage.setItem("user", JSON.stringify(appUser));

            try {
              const token = await firebaseUser.getIdToken(true);
              localStorage.setItem("token", token);
              console.log("[Auth Listener] Token refreshed and stored.");
            } catch (tokenError) {
              console.error(
                "[Auth Listener] Failed to refresh token:",
                tokenError
              );
              localStorage.removeItem("token");
            }
          } else {
            console.warn(
              "[Auth Listener] User authenticated but not found in Firestore! UID:",
              firebaseUser.uid
            );
            setUser(null);
            localStorage.removeItem("user");
            localStorage.removeItem("token");
            await signOut(auth);
          }
        } else {
          console.log("[Auth Listener] User logged out.");
          setUser(null);
          localStorage.removeItem("user");
          localStorage.removeItem("token");
        }
      } catch (error) {
        console.error("[Auth Listener] Error processing auth state:", error);
        setUser(null);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      } finally {
        setLoading(false);
        console.log(
          "[Auth Listener] Auth state processing finished. Loading set to false."
        );
      }
    });

    return () => {
      console.log("UserProvider unmounted. Unsubscribing auth listener.");
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    const currentUser = user;
    console.log("Logout process started for user:", currentUser?.uid);
    try {
      if (currentUser) {
        try {
          if (typeof messaging !== "undefined" && messaging !== null) {
            console.log("Attempting to deactivate FCM token...");

            try {
              const currentToken = await getToken(messaging, {
                vapidKey: FCM_VAPID_KEY,
              }).catch((err) => {
                console.warn("Logout: Token get error:", err.message);
                return null;
              });

              if (currentToken) {
                await saveTokenToFirestore(user.uid, currentToken, "web");

                await deleteToken(messaging).catch((err) => {
                  console.warn("Logout: Token delete error:", err.message);
                });
                console.log("FCM token successfully deleted");
              }
            } catch (tokenError) {
              console.warn("FCM token operations failed:", tokenError);
            }
          } else {
            console.log("Messaging not initialized, skipping token deletion");
          }
        } catch (fcmError) {
          console.error("FCM operations error:", fcmError);
        }
      }

      console.log("Logout: Signing out from Firebase Auth...");
      await signOut(auth);

      setUser(null);
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      console.log("Logout: Context and localStorage cleared. Logout complete.");
    } catch (error) {
      console.error("Logout error:", error);
      setUser(null);
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser, loading, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = React.useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
