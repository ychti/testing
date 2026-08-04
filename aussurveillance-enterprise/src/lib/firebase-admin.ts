import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function decodeServiceAccountJson(): string | null {
  const plain = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (plain && plain.trim().length > 0) {
    return plain;
  }

  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64 && base64.trim().length > 0) {
    return Buffer.from(base64, "base64").toString("utf8");
  }

  return null;
}

function initializeFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const decoded = decodeServiceAccountJson();
  if (!decoded) {
    throw new Error(
      "Firebase admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64.",
    );
  }

  const parsed = JSON.parse(decoded) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };

  const privateKey = parsed.private_key.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID ?? parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey,
    }),
    projectId: process.env.FIREBASE_PROJECT_ID ?? parsed.project_id,
  });
}

export function getFirestoreAdmin() {
  const app = initializeFirebaseAdminApp();
  return getFirestore(app);
}

