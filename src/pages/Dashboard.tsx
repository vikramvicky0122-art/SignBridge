import React from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { Video, Languages, History, MessageSquare, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const features = [
  {
    title: 'Video Call Interpreter',
    description: 'Real-time sign language translation during video calls.',
    icon: Video,
    path: '/video-call',
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    title: 'Live Translator',
    description: 'Instant conversion between speech and sign language.',
    icon: Languages,
    path: '/live-translator',
    color: 'bg-indigo-500',
    lightColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    textColor: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    title: 'Call History',
    description: 'Review your previous conversations and transcripts.',
    icon: History,
    path: '/history',
    color: 'bg-emerald-500',
    lightColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    title: 'AI Chatbot',
    description: 'Get help with translations and learning sign language.',
    icon: MessageSquare,
    path: '/chatbot',
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50 dark:bg-purple-900/20',
    textColor: 'text-purple-600 dark:text-purple-400',
  },
];

const Dashboard: React.FC = () => {
  const { profile } = useAuth();

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <header className="mb-12">
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-bold text-neutral-900 dark:text-white mb-2"
          >
            Hello, {profile?.name || 'User'}!
          </motion.h2>
          <p className="text-neutral-500 dark:text-neutral-400 text-lg">
            What would you like to do today?
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link
                  to={feature.path}
                  className="group block bg-white dark:bg-neutral-900 p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300 shadow-sm hover:shadow-xl"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className={cn("p-4 rounded-2xl", feature.lightColor)}>
                      <Icon className={cn("w-8 h-8", feature.textColor)} />
                    </div>
                    <div className="p-2 rounded-full bg-neutral-50 dark:bg-neutral-800 group-hover:bg-blue-500 group-hover:text-white transition-all">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">{feature.title}</h3>
                  <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {feature.description}
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <section className="mt-16">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-10 text-white relative overflow-hidden">
            <div className="relative z-10 max-w-lg">
              <h3 className="text-3xl font-bold mb-4">New to Sign Language?</h3>
              <p className="text-blue-100 mb-8 text-lg">
                Our AI Chatbot can help you learn basic signs and phrases to get started.
              </p>
              <Link
                to="/chatbot"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all"
              >
                Start Learning
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Dashboard;

import { cn } from '../lib/utils';
