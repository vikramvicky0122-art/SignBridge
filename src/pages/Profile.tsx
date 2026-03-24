import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { updateProfile } from 'firebase/auth';
import { motion } from 'motion/react';
import { User, Mail, Shield, Calendar, Save, Loader2, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const Profile: React.FC = () => {
  const { profile, user } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;

    setLoading(true);
    try {
      await updateProfile(user, { displayName: name });
      await updateDoc(doc(db, 'users', user.uid), { name });
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <header className="mb-10">
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
            <User className="w-8 h-8 text-blue-500" />
            My Profile
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400">Manage your account settings and preferences</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 border border-neutral-200 dark:border-neutral-800 text-center">
              <div className="w-32 h-32 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <UserCircle className="w-20 h-20 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-1">{profile?.name}</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 capitalize mb-4">{profile?.role} Person</p>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs font-bold rounded-full uppercase tracking-wider">
                Active
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-6">
            <form onSubmit={handleUpdate} className="bg-white dark:bg-neutral-900 rounded-3xl p-8 border border-neutral-200 dark:border-neutral-800 space-y-6 shadow-sm">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                Personal Information
              </h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="email"
                      disabled
                      value={profile?.email}
                      className="w-full pl-12 pr-4 py-3 bg-neutral-100 dark:bg-neutral-800/50 border-none rounded-2xl text-neutral-500 cursor-not-allowed outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 ml-1">Member Since</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                      type="text"
                      disabled
                      value={profile?.createdAt ? format(new Date(profile.createdAt), 'MMMM d, yyyy') : ''}
                      className="w-full pl-12 pr-4 py-3 bg-neutral-100 dark:bg-neutral-800/50 border-none rounded-2xl text-neutral-500 cursor-not-allowed outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || name === profile?.name}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Save Changes
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
