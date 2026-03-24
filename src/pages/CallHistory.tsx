import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { CallRecord } from '../types';
import { motion } from 'motion/react';
import { History, Video, Languages, Clock, Calendar, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

const CallHistory: React.FC = () => {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCalls = async () => {
      if (!user) return;
      try {
        const q = query(
          collection(db, 'calls'),
          where('participants', 'array-contains', user.uid),
          orderBy('startTime', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const callData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallRecord));
        setCalls(callData);
      } catch (error) {
        console.error('Error fetching calls:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalls();
  }, [user]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
            <History className="w-8 h-8 text-emerald-500" />
            Call History
          </h2>
          <p className="text-neutral-500 dark:text-neutral-400">Review your past conversations and transcripts</p>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
          </div>
        ) : calls.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-3xl p-12 text-center border border-neutral-200 dark:border-neutral-800">
            <div className="w-20 h-20 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <History className="w-10 h-10 text-neutral-400" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">No calls yet</h3>
            <p className="text-neutral-500 dark:text-neutral-400">Your call history will appear here once you start using the app.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {calls.map((call, index) => (
              <motion.div
                key={call.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 hover:border-emerald-500 transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center",
                      call.mode === 'video' ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600" : "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600"
                    )}>
                      {call.mode === 'video' ? <Video className="w-7 h-7" /> : <Languages className="w-7 h-7" />}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-neutral-900 dark:text-white mb-1">
                        {call.mode === 'video' ? 'Video Call Interpreter' : 'Live Translator Session'}
                      </h4>
                      <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(call.startTime), 'MMM d, yyyy')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {format(new Date(call.startTime), 'h:mm a')}
                        </span>
                        {call.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {Math.floor(call.duration / 60)}m {call.duration % 60}s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-6 h-6 text-neutral-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CallHistory;

import { cn } from '../lib/utils';
