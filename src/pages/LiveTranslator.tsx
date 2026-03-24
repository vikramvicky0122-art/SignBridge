import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, Mic, MicOff, Camera, CameraOff, Volume2, Play, Pause, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import signMapData from '../lib/signMap.json';

const signMap = signMapData as Record<string, string>;

const LiveTranslator: React.FC = () => {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'speech-to-sign' | 'sign-to-speech'>(
    profile?.role === 'speaking' ? 'speech-to-sign' : 'sign-to-speech'
  );
  const [isListening, setIsListening] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [detectedSign, setDetectedSign] = useState('');
  const [loading, setLoading] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const lastPredictionTimeRef = useRef<number>(0);
  const lastSpokenSignRef = useRef<string>('');
  const isCameraOnRef = useRef(false);
  const isListeningRef = useRef(false);
  
  const signVideoRef = useRef<HTMLVideoElement>(null);
  const wordQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const processedInterimWordsRef = useRef<number>(0);
  const currentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const playNextSign = () => {
    if (currentTimeoutRef.current) clearTimeout(currentTimeoutRef.current);

    if (wordQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const word = wordQueueRef.current.shift();
    if (word && signVideoRef.current) {
      const exactFilename = signMap[word] || signMap[word.charAt(0)]; // fallback to letter
      
      if (exactFilename) {
        signVideoRef.current.src = `/isl_videos/${exactFilename}`;
        signVideoRef.current.load();
        
        signVideoRef.current.onloadeddata = () => {
          signVideoRef.current?.play().catch(e => console.error(e));
          currentTimeoutRef.current = setTimeout(playNextSign, 2000);
        };

        signVideoRef.current.onended = () => {
          if (currentTimeoutRef.current) clearTimeout(currentTimeoutRef.current);
          setTimeout(playNextSign, 100);
        };

        signVideoRef.current.onerror = () => {
          console.warn(`Video error for exact file: ${exactFilename}`);
          playNextSign();
        };
      } else {
        console.warn(`No video mapping found for: ${word}`);
        playNextSign();
      }
    }
  };

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const finalWordsText = event.results[i][0].transcript;
            const finalWords = finalWordsText.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter((w: string) => w);
            
            for (let j = processedInterimWordsRef.current; j < finalWords.length; j++) {
              wordQueueRef.current.push(finalWords[j]);
            }
            
            processedInterimWordsRef.current = 0;
            setTranscript(prev => prev + finalWordsText + ' ');
            
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        if (interimTranscript) {
          const interimWords = interimTranscript.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter((w: string) => w);
          if (interimWords.length > processedInterimWordsRef.current) {
            for (let j = processedInterimWordsRef.current; j < interimWords.length; j++) {
              wordQueueRef.current.push(interimWords[j]);
              processedInterimWordsRef.current++;
            }
          }
        }
        
        if (!isPlayingRef.current) {
          playNextSign();
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setIsListening(false);
          isListeningRef.current = false;
        }
      };

      recognitionRef.current.onend = () => {
        if (isListeningRef.current) {
          // Restart if it ended automatically
          try {
            recognitionRef.current?.start();
          } catch (e) {
            console.error('Failed to restart recognition', e);
          }
        }
      };
    }
  }, []);

  useEffect(() => {
    if (mode === 'speech-to-sign') {
      if (!isListeningRef.current) {
        isListeningRef.current = true;
        setIsListening(true);
        setTimeout(() => { try { recognitionRef.current?.start(); } catch (e) {} }, 500);
      }
    } else {
      if (isListeningRef.current) {
        isListeningRef.current = false;
        setIsListening(false);
        try { recognitionRef.current?.stop(); } catch (e) {}
      }
    }
  }, [mode]);

  // Hand Detection is handled by the backend ML model

  const toggleListening = () => {
    if (isListeningRef.current) {
      isListeningRef.current = false;
      setIsListening(false);
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      isListeningRef.current = true;
      setIsListening(true);
      try {
        recognitionRef.current?.start();
      } catch (e) {
         // might already be started
      }
    }
  };

  const toggleCamera = async () => {
    if (isCameraOn) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      setIsCameraOn(false);
      isCameraOnRef.current = false;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraOn(true);
          isCameraOnRef.current = true;
          detectHands();
        }
      } catch (error) {
        toast.error('Could not access camera');
      }
    }
  };

  const detectHands = async () => {
    if (!videoRef.current || !isCameraOnRef.current) return;

    const now = Date.now();
    if (now - lastPredictionTimeRef.current > 500) {
      lastPredictionTimeRef.current = now;
      
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(async (blob) => {
            if (blob) {
              const formData = new FormData();
              formData.append('frame', blob, 'frame.jpg');
              
              try {
                const mlBackendUrl = import.meta.env.VITE_ML_BACKEND_URL || 'http://localhost:5001';
                const response = await fetch(`${mlBackendUrl}/predict`, {
                  method: 'POST',
                  body: formData,
                });
                const data = await response.json();
                
                if (data && data.letter && data.letter !== 'No hand detected') {
                  setDetectedSign(data.letter);
                  // Ensure we don't spam audio with low-confidence false positives
                  if (lastSpokenSignRef.current !== data.letter && (data.confidence === undefined || data.confidence > 0.8)) {
                    speak(`Letter ${data.letter}`);
                    lastSpokenSignRef.current = data.letter;
                  }
                } else {
                  setDetectedSign('');
                  lastSpokenSignRef.current = '';
                }
              } catch (error) {
                console.error('Error predicting sign:', error);
              }
            }
          }, 'image/jpeg');
        }
      }
    }

    if (isCameraOnRef.current) {
      requestAnimationFrame(detectHands);
    }
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
              <Languages className="w-8 h-8 text-indigo-500" />
              Live Translator
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400">Real-time conversion between speech and sign language</p>
          </div>

          <div className="flex bg-white dark:bg-neutral-900 p-1.5 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
            <button
              onClick={() => setMode('speech-to-sign')}
              className={cn(
                "px-6 py-2.5 rounded-xl font-bold transition-all",
                mode === 'speech-to-sign' ? "bg-indigo-600 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              )}
            >
              Speech to Sign
            </button>
            <button
              onClick={() => setMode('sign-to-speech')}
              className={cn(
                "px-6 py-2.5 rounded-xl font-bold transition-all",
                mode === 'sign-to-speech' ? "bg-indigo-600 text-white shadow-lg" : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              )}
            >
              Sign to Speech
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 border border-neutral-200 dark:border-neutral-800 shadow-sm h-[500px] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  {mode === 'speech-to-sign' ? <Mic className="w-5 h-5 text-indigo-500" /> : <Camera className="w-5 h-5 text-indigo-500" />}
                  Input Source
                </h3>
                {mode === 'speech-to-sign' ? (
                  <button
                    onClick={toggleListening}
                    className={cn(
                      "p-4 rounded-2xl transition-all",
                      isListening ? "bg-red-500 text-white animate-pulse" : "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600"
                    )}
                  >
                    {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                  </button>
                ) : (
                  <button
                    onClick={toggleCamera}
                    className={cn(
                      "p-4 rounded-2xl transition-all",
                      isCameraOn ? "bg-red-500 text-white" : "bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600"
                    )}
                  >
                    {isCameraOn ? <CameraOff className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                  </button>
                )}
              </div>

              <div className="flex-1 relative rounded-2xl overflow-hidden bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                {mode === 'speech-to-sign' ? (
                  <div className="p-6 h-full overflow-y-auto">
                    {transcript ? (
                      <p className="text-2xl font-medium text-neutral-800 dark:text-neutral-200 leading-relaxed">
                        {transcript}
                      </p>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                        <Mic className="w-12 h-12 mb-4 opacity-20" />
                        <p>{isListening ? 'Listening...' : 'Click the mic to start speaking'}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={cn("w-full h-full object-cover", !isCameraOn && "hidden")}
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    {!isCameraOn && (
                      <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                        <Camera className="w-12 h-12 mb-4 opacity-20" />
                        <p>Camera is off</p>
                      </div>
                    )}
                    {loading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                        <RefreshCw className="w-8 h-8 animate-spin mr-2" />
                        Loading AI Model...
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 border border-neutral-200 dark:border-neutral-800 shadow-sm h-[500px] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-500" />
                  AI Translation
                </h3>
                <div className="flex gap-2">
                  <button className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-indigo-600 transition-all">
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 rounded-2xl overflow-hidden bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 flex flex-col items-center justify-center p-8 text-center">
                {mode === 'speech-to-sign' ? (
                  <div className="space-y-6 w-full h-full flex flex-col items-center justify-center">
                    <div className="relative w-full max-w-sm bg-black rounded-3xl overflow-hidden shadow-inner border border-neutral-100 dark:border-neutral-800 mx-auto aspect-video">
                      <video 
                        ref={signVideoRef}
                        className={cn("w-full h-full object-cover transition-opacity duration-300", transcript ? "opacity-100" : "opacity-0")}
                        muted
                        playsInline
                      />
                      {!transcript && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Languages className="w-16 h-16 text-neutral-600 opacity-20" />
                        </div>
                      )}
                    </div>
                    <p className="text-neutral-500 dark:text-neutral-400 mt-4">
                      {transcript ? 'Converting speech to ISL videos...' : 'Waiting for speech input...'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <AnimatePresence mode="wait">
                      {detectedSign ? (
                        <motion.div
                          key={detectedSign}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="space-y-4"
                        >
                          <div className="text-6xl font-bold text-indigo-600 dark:text-indigo-400">
                            {detectedSign}
                          </div>
                          <p className="text-neutral-500 dark:text-neutral-400">Detected Sign</p>
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center text-neutral-400">
                          <Languages className="w-16 h-16 mb-4 opacity-20" />
                          <p>Waiting for hand gestures...</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default LiveTranslator;
