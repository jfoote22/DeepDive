'use client';

import { useContext, useState } from 'react';
import { AuthContext } from '../lib/contexts/AuthContext';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase/firebase';

export default function FirebaseTest() {
  const { user } = useContext(AuthContext);
  const [testResult, setTestResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const runFirestoreTest = async () => {
    setIsLoading(true);
    setTestResult('🔄 Testing Firestore connection...');
    
    try {
      if (!user) {
        setTestResult('❌ No user authenticated. Please sign in first.');
        return;
      }

      console.log('🧪 Starting Firestore test...');
      console.log('✅ User authenticated:', user.email);
      console.log('📋 User ID:', user.uid);

      // Test data
      const testData = {
        title: 'Test Deep Dive',
        description: 'This is a test',
        mainMessages: [
          { id: 'test-1', role: 'user', content: 'Hello', timestamp: Date.now() }
        ],
        threads: [],
        selectedModel: 'anthropic',
        userId: user.uid,
        createdAt: new Date(),
        metadata: { totalMessages: 1, totalThreads: 0 }
      };

      console.log('💾 Attempting to save test data:', testData);
      
      const docRef = await addDoc(collection(db, 'deepdives'), testData);
      
      console.log('✅ Test document created with ID:', docRef.id);
      setTestResult(`✅ Success! Test document created with ID: ${docRef.id}\n\nFirestore is working correctly. Your save/load issues might be elsewhere.`);
      
    } catch (error) {
      console.error('❌ Firestore test failed:', error);
      
      let errorMsg = '❌ Firestore test failed:\n\n';
      if (error instanceof Error) {
        errorMsg += `Error: ${error.message}\n\n`;
        
        if (error.message.includes('permission-denied')) {
          errorMsg += '🔧 SOLUTION: Set up Firestore security rules:\n';
          errorMsg += '1. Go to Firebase Console\n';
          errorMsg += '2. Navigate to Firestore Database\n';
          errorMsg += '3. Click "Rules" tab\n';
          errorMsg += '4. Copy the rules from FIREBASE_SETUP.md\n';
          errorMsg += '5. Click "Publish"';
        } else if (error.message.includes('unauthenticated')) {
          errorMsg += '🔑 SOLUTION: Authentication issue\n';
          errorMsg += '1. Try signing out and signing back in\n';
          errorMsg += '2. Check Firebase Auth configuration';
        }
      } else {
        errorMsg += 'Unknown error occurred.';
      }
      
      setTestResult(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-800 rounded-lg border border-slate-600 max-w-md">
      <h3 className="text-white font-bold mb-4">🧪 Firebase Connection Test</h3>
      
      <button
        onClick={runFirestoreTest}
        disabled={isLoading || !user}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 mb-4"
      >
        {isLoading ? 'Testing...' : 'Test Firestore'}
      </button>
      
      {!user && (
        <p className="text-gray-400 text-sm mb-4">Sign in first to test Firestore</p>
      )}
      
      {testResult && (
        <div className="bg-slate-700 p-3 rounded-lg">
          <pre className="text-sm text-white whitespace-pre-wrap">{testResult}</pre>
        </div>
      )}
    </div>
  );
} 