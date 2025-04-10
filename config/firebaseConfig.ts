import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDk47IjfGi7oXk98lz5jEt2fhrwJlyOTP4",
    authDomain: "ecomerce-4651d.firebaseapp.com",
    projectId: "ecomerce-4651d",
    storageBucket: "ecomerce-4651d.firebasestorage.app",
    messagingSenderId: "1071079126935",
    appId: "1:1071079126935:web:4a95a9d077c08b76c576d2"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth }; 