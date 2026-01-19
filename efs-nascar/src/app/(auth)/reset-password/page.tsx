'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Check if we have a valid session from the reset link
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // No session means the reset link is invalid or expired
        setError('Invalid or expired reset link. Please request a new one.');
      }
    };
    checkSession();
  }, [supabase.auth]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Redirect to login after 3 seconds
    setTimeout(() => {
      router.push('/login');
    }, 3000);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0a1a] px-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/30 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-md w-full relative z-10">
          <div className="glass rounded-2xl shadow-2xl p-8 text-center border border-purple-500/20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Password Updated!</h2>
            <p className="text-purple-300 mb-6">
              Your password has been successfully reset. Redirecting you to login...
            </p>
            <Link
              href="/login"
              className="inline-block py-3 px-6 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-400 hover:from-yellow-300 hover:via-yellow-200 hover:to-yellow-300 shadow-lg shadow-yellow-500/25 transition-all"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0a1a] px-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/4 left-1/4 w-4 h-4 text-yellow-400 opacity-30">★</div>
        <div className="absolute top-1/3 right-1/4 w-4 h-4 text-yellow-400 opacity-20">★</div>
        <div className="absolute bottom-1/4 left-1/3 w-4 h-4 text-yellow-400 opacity-25">★</div>
        <div className="absolute bottom-1/3 right-1/3 w-4 h-4 text-yellow-400 opacity-15">★</div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="flex justify-center mb-4">
          <Image
            src="/Logo.svg"
            alt="EFS NASCAR"
            width={200}
            height={60}
            priority
          />
        </div>

        <div className="glass rounded-2xl shadow-2xl p-8 border border-purple-500/20">
          <h2 className="text-2xl font-bold text-white mb-2">Set New Password</h2>
          <p className="text-purple-400 text-sm mb-6">
            Enter your new password below.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-purple-200">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-3 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white placeholder-purple-400/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-purple-200">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="mt-1 block w-full px-4 py-3 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white placeholder-purple-400/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-400 hover:from-yellow-300 hover:via-yellow-200 hover:to-yellow-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 focus:ring-offset-[#1c1726] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/25 transition-all"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-purple-300">
            <Link href="/login" className="text-yellow-400 hover:text-yellow-300 font-medium">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
