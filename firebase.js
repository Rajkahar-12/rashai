
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyC6pvqzMOBs2y3edfgZKa2RD4ryPGZDK7o",
  authDomain: "rashai-b5046.firebaseapp.com",
  projectId: "rashai-b5046",
  storageBucket: "rashai-b5046.firebasestorage.app",
  messagingSenderId: "500642552556",
  appId: "1:500642552556:web:c7b8ccc7fff012cd4b23c9",
  measurementId: "G-55E7GQXJG0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

let recaptchaVerifier = null;
let phoneConfirmation = null;

// Authentication state
function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// Google login
async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// Email registration
async function registerWithEmail(name, email, password) {
  const result = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  await updateProfile(result.user, {
    displayName: name
  });

  return result.user;
}

// Email login
async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return result.user;
}

// Password reset
async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// Phone OTP: send code
async function sendPhoneOTP(phoneNumber) {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(
      auth,
      "recaptcha-container",
      { size: "invisible" }
    );
  }

  phoneConfirmation = await signInWithPhoneNumber(
    auth,
    phoneNumber,
    recaptchaVerifier
  );

  return true;
}

// Phone OTP: verify code
async function verifyPhoneOTP(code) {
  if (!phoneConfirmation) {
    throw new Error("Please request an OTP first.");
  }

  const result = await phoneConfirmation.confirm(code);
  phoneConfirmation = null;

  return result.user;
}

// Reset reCAPTCHA if needed
function resetPhoneRecaptcha() {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }

  phoneConfirmation = null;
}

// Sign out
async function logout() {
  return signOut(auth);
}

// Get current user's Firebase ID token
async function getToken() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in first.");
  }

  return user.getIdToken();
}

// Firestore: save a chat
async function saveChat(chat) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in to save chats.");
  }

  const chatRef = doc(
    db,
    "users",
    user.uid,
    "chats",
    String(chat.id)
  );

  await setDoc(chatRef, {
    title: chat.title || "New session",
    messages: chat.messages || [],
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// Firestore: load all chats
async function loadChats() {
  const user = auth.currentUser;

  if (!user) return [];

  const chatsRef = collection(
    db,
    "users",
    user.uid,
    "chats"
  );

  const chatsQuery = query(
    chatsRef,
    orderBy("updatedAt", "desc")
  );

  const snapshot = await getDocs(chatsQuery);

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}

// Firestore: delete a chat
async function deleteChat(chatId) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in first.");
  }

  await deleteDoc(
    doc(db, "users", user.uid, "chats", String(chatId))
  );
}

// Expose functions to the existing RashAI script
window.rashaiFirebase = {
  auth,
  watchAuth,
  loginWithGoogle,
  registerWithEmail,
  loginWithEmail,
  resetPassword,
  sendPhoneOTP,
  verifyPhoneOTP,
  resetPhoneRecaptcha,
  logout,
  getToken,
  saveChat,
  loadChats,
  deleteChat
};
