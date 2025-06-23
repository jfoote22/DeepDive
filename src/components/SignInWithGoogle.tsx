"use client";

import { useContext } from 'react';
import { AuthContext } from '../lib/contexts/AuthContext';
import Image from 'next/image';

export default function SignInWithGoogle() {
  const { user, loading, signInWithGoogle, signOut } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-400">Loading...</span>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
        <Image
          src={user.photoURL || '/next.svg'}
          alt={user.displayName || 'User'}
          width={40}
          height={40}
          className="w-10 h-10 rounded-full border-2 border-green-500"
        />
        <div className="flex-1">
          <div className="text-white font-medium">{user.displayName}</div>
          <div className="text-gray-400 text-sm">{user.email}</div>
        </div>
        <button
          onClick={signOut}
          className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="text-center p-8 bg-slate-800/50 rounded-lg border border-slate-600">
      <div className="text-4xl mb-4">🔐</div>
      <h2 className="text-xl font-bold text-white mb-2">Sign in to Save Your Deep Dives</h2>
      <p className="text-gray-400 mb-6">
        Sign in with Google to save, load, and manage your deep dive conversations across devices.
      </p>
      <button
        onClick={signInWithGoogle}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 shadow-lg flex items-center gap-3 mx-auto"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
      
      <div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
        <h3 className="text-white font-medium mb-2">✨ What you get with sign-in:</h3>
        <ul className="text-sm text-gray-300 space-y-1 text-left">
          <li>💾 Save unlimited deep dive conversations</li>
          <li>☁️ Access your deep dives from any device</li>
          <li>🔄 Resume conversations where you left off</li>
          <li>🗂️ Organize and manage your saved conversations</li>
          <li>🔒 Your data is private and secure</li>
        </ul>
      </div>
    </div>
  );
}
