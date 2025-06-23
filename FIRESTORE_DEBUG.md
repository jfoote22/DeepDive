# Firestore Debug Guide

## Most Common Issues and Solutions

### 1. Security Rules Not Set Up
**Error**: Permission denied or "Missing or insufficient permissions"

**Solution**: Set up Firestore rules in Firebase Console:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to read/write their own deep dives
    match /deepdives/{deepdiveId} {
      allow read, write, delete: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

### 2. Authentication Issues
**Error**: "User must be authenticated"

**Check**: 
- Is the user signed in? Check browser console for auth state
- Are Firebase auth settings correct?

### 3. Environment Variables
**Check** your `.env.local` file has all required variables:
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### 4. Data Structure Issues
**Check**: Are all data fields properly serialized?

## Debug Steps:

1. **Open Browser Console** (F12) and look for error messages
2. **Check Firebase Console** for authentication and database logs
3. **Verify Security Rules** are published and active
4. **Test Authentication** - make sure sign-in works first
5. **Check Network Tab** for failed requests

## Quick Test Function

Add this to your browser console to test basic Firestore connection:
```javascript
// Test if user is authenticated
console.log('Auth user:', window.firebase?.auth?.currentUser);

// Test basic Firestore write (will fail if rules not set up)
window.firebase?.firestore?.().collection('test').add({test: 'data'})
  .then(() => console.log('✅ Firestore write test passed'))
  .catch(err => console.error('❌ Firestore write test failed:', err));
```

## Common Error Messages:

- **"7 PERMISSION_DENIED"** → Security rules issue
- **"16 UNAUTHENTICATED"** → User not signed in
- **"3 INVALID_ARGUMENT"** → Data structure issue
- **"14 UNAVAILABLE"** → Network/connection issue 