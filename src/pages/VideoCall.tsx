import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Video, Mic, MicOff, Camera, CameraOff, PhoneOff, User, MessageSquare, Send, Sparkles, Settings, Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { io, Socket } from 'socket.io-client';
import signMapData from '../lib/signMap.json';

const signMap = signMapData as Record<string, string>;

import { useSearchParams } from 'react-router-dom';

const VideoCall: React.FC = () => {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [inCall, setInCall] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [callMode, setCallMode] = useState<'speaking' | 'deaf' | null>(null);
  const callModeRef = useRef<'speaking' | 'deaf' | null>(null);
  const [transcript, setTranscript] = useState('');
  const [detectedSign, setDetectedSign] = useState('');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [signalingStatus, setSignalingStatus] = useState<'disconnected' | 'connected'>('disconnected');
  const [signalingLogs, setSignalingLogs] = useState<string[]>([]);
  const [isPolite, setIsPolite] = useState(false);
  const isPoliteRef = useRef(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef<Date | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceCandidateBuffer = useRef<RTCIceCandidateInit[]>([]);
  const roomIdRef = useRef(roomId);
  const inCallRef = useRef(inCall);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signVideoRef = useRef<HTMLVideoElement>(null);
  const wordQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const processedInterimWordsRef = useRef<number>(0);
  const currentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const lastPredictionTimeRef = useRef<number>(0);
  const lastSpokenSignRef = useRef<string>('');

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const playNextSign = () => {
    if (currentTimeoutRef.current) clearTimeout(currentTimeoutRef.current);
    if (wordQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;
    const word = wordQueueRef.current.shift();
    if (word && signVideoRef.current) {
      const exactFilename = signMap[word] || signMap[word.charAt(0)];
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
        signVideoRef.current.onerror = () => playNextSign();
      } else {
        playNextSign();
      }
    }
  };

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    const urlRoomId = searchParams.get('roomId');
    if (urlRoomId && !inCall) {
      setInputRoomId(urlRoomId);
      toast.info('Room ID loaded from link. Click Join to connect.');
    }
  }, [searchParams, inCall]);

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
            const newWords = [];
            for (let j = processedInterimWordsRef.current; j < finalWords.length; j++) {
              newWords.push(finalWords[j]);
            }
            if (newWords.length > 0) {
              socketRef.current?.emit('chat-message', { roomId: roomIdRef.current, message: JSON.stringify({ type: 'ai-speech', words: newWords }) });
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
            const newWords = [];
            for (let j = processedInterimWordsRef.current; j < interimWords.length; j++) {
              newWords.push(interimWords[j]);
              processedInterimWordsRef.current++;
            }
            socketRef.current?.emit('chat-message', { roomId: roomIdRef.current, message: JSON.stringify({ type: 'ai-speech', words: newWords }) });
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
      };

      recognitionRef.current.onend = () => {
        if (inCallRef.current && callModeRef.current === 'speaking') {
          setTimeout(() => { try { recognitionRef.current?.start(); } catch (e) {} }, 500);
        }
      };
    }
  }, []);

  useEffect(() => {
    socketRef.current = io({
      transports: ['websocket'],
      upgrade: false,
      reconnectionAttempts: 5,
      timeout: 10000
    });

    socketRef.current.on('connect', () => {
      const log = 'Signaling server connected: ' + socketRef.current?.id;
      console.log(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      setSignalingStatus('connected');
    });

    socketRef.current.on('connect_error', (error) => {
      const log = 'Signaling error: ' + error.message;
      console.error(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      setSignalingStatus('disconnected');
    });

    socketRef.current.on('disconnect', () => {
      const log = 'Signaling server disconnected';
      console.log(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      setSignalingStatus('disconnected');
    });

    socketRef.current.on('room-info', ({ size }) => {
      const log = `Room info: ${size} users in room`;
      console.log(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      // If we are the second person, we are "polite" (callee)
      // If we are the first person, we are "impolite" (caller)
      setIsPolite(size > 1);
      isPoliteRef.current = size > 1;
    });

    socketRef.current.on('user-joined', (userId) => {
      const log = 'Partner joined room: ' + userId;
      console.log(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      // We wait for the 'ready' signal from the new user before sending offer
    });

    socketRef.current.on('ready', async (userId) => {
      const log = 'Partner is ready, initiating offer: ' + userId;
      console.log(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      
      // Only the first person (impolite) should initiate the offer
      if (!isPoliteRef.current && peerConnectionRef.current) {
        try {
          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);
          socketRef.current?.emit('offer', { roomId: roomIdRef.current, offer });
          setConnectionStatus('connecting');
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      }
    });

    socketRef.current.on('offer', async ({ senderId, offer }) => {
      const log = 'Received offer from: ' + senderId;
      console.log(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socketRef.current?.emit('answer', { roomId: roomIdRef.current, answer });
          setConnectionStatus('connecting');
          
          // Process buffered candidates
          while (iceCandidateBuffer.current.length > 0) {
            const candidate = iceCandidateBuffer.current.shift();
            if (candidate) await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          console.error('Error handling offer:', err);
        }
      }
    });

    socketRef.current.on('answer', async ({ senderId, answer }) => {
      const log = 'Received answer from: ' + senderId;
      console.log(log);
      setSignalingLogs(prev => [...prev.slice(-4), log]);
      
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setConnectionStatus('connected');
          
          // Process buffered candidates
          while (iceCandidateBuffer.current.length > 0) {
            const candidate = iceCandidateBuffer.current.shift();
            if (candidate) await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          console.error('Error handling answer:', err);
        }
      }
    });

    socketRef.current.on('ice-candidate', async ({ senderId, candidate }) => {
      if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding received ice candidate', e);
        }
      } else {
        iceCandidateBuffer.current.push(candidate);
      }
    });

    socketRef.current.on('chat-message', (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'ai-sign') {
          setDetectedSign(parsed.sign);
          if (callModeRef.current === 'speaking' && lastSpokenSignRef.current !== parsed.sign) {
             speak(parsed.sign);
             lastSpokenSignRef.current = parsed.sign;
          }
          return;
        }
        if (parsed.type === 'ai-speech') {
          if (callModeRef.current === 'deaf') {
             parsed.words.forEach((w: string) => wordQueueRef.current.push(w));
             if (!isPlayingRef.current) playNextSign();
             setTranscript(prev => prev + parsed.words.join(' ') + ' ');
          }
          return;
        }
      } catch (e) {
        setMessages(prev => [...prev, { sender: 'Partner', text: message }]);
      }
    });

    return () => {
      socketRef.current?.disconnect();
      // Only end call if we are actually in a call and unmounting
      if (inCallRef.current) {
        endCall();
      }
    };
  }, []);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMicOn;
      });
    }
  }, [isMicOn]);

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = isCameraOn;
      });
    }
  }, [isCameraOn]);

  const detectHands = async () => {
    if (!localVideoRef.current || !inCallRef.current || callModeRef.current !== 'deaf') return;

    const now = Date.now();
    if (now - lastPredictionTimeRef.current > 500) {
      lastPredictionTimeRef.current = now;
      
      const canvas = canvasRef.current;
      const video = localVideoRef.current;
      if (canvas && video && video.readyState >= 2) {
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
                const response = await fetch('http://localhost:5001/predict', { method: 'POST', body: formData });
                const data = await response.json();
                if (data && data.letter && data.letter !== 'No hand detected') {
                   setDetectedSign(data.letter);
                   // Only broadcast to the Speaking person if the ML model is highly confident (>80%)
                   if (data.confidence !== undefined && data.confidence > 0.8) {
                     socketRef.current?.emit('chat-message', { 
                       roomId: roomIdRef.current, 
                       message: JSON.stringify({ type: 'ai-sign', sign: data.letter }) 
                     });
                   }
                }
              } catch (error) {
                // ignore
              }
            }
          }, 'image/jpeg');
        }
      }
    }

    if (inCallRef.current && callModeRef.current === 'deaf') {
      requestAnimationFrame(detectHands);
    }
  };

  useEffect(() => {
    if (inCall && callMode === 'deaf') {
      detectHands();
    }
  }, [inCall, callMode]);

  const initPeerConnection = (stream: MediaStream) => {
    const pc = new RTCPeerConnection(configuration);
    
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Ensure we can receive media even if camera/mic is locked and we sent 0 tracks
    if (stream.getVideoTracks().length === 0) {
      pc.addTransceiver('video', { direction: 'recvonly' });
    }
    if (stream.getAudioTracks().length === 0) {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        socketRef.current?.emit('ice-candidate', { roomId: roomIdRef.current, candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionStatus('failed');
        toast.error('Connection failed. Please try again.');
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0].id);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = pc;
  };

  const startCall = async (mode: 'speaking' | 'deaf', targetRoomId?: string) => {
    const finalRoomId = targetRoomId || Math.random().toString(36).substring(7);
    setRoomId(finalRoomId);
    setCallMode(mode);
    callModeRef.current = mode;
    setInCall(true);
    startTimeRef.current = new Date();
    
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }, 
          audio: true 
        });
      } catch (cameraErr) {
        console.warn('Camera locked or unavailable. Trying audio-only mode...', cameraErr);
        toast.info('Camera in use by Tab 1. Joining as Audio-only for testing.');
        setIsCameraOn(false);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } catch (micErr) {
          console.warn('Mic also locked or unavailable. Joining as receive-only...', micErr);
          toast.info('Hardware locked. Joining as Receive-only mode.');
          setIsMicOn(false);
          stream = new MediaStream();
        }
      }

      localStreamRef.current = stream;
      if (localVideoRef.current && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream;
      }
      
      if (mode === 'speaking') {
        processedInterimWordsRef.current = 0;
        setTranscript('');
        try { recognitionRef.current?.start(); } catch (e) {}
      }

      initPeerConnection(stream);
      socketRef.current?.emit('join-room', finalRoomId);
      // Tell others in the room we are ready to receive an offer
      socketRef.current?.emit('ready', finalRoomId);
      
      toast.success(`Joined room: ${finalRoomId}`);
    } catch (error) {
      toast.error('Could not access camera or microphone at all');
      setInCall(false);
    }
  };

  const endCall = async () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    
    if (startTimeRef.current && user) {
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - startTimeRef.current.getTime()) / 1000);
      
      try {
        await addDoc(collection(db, 'calls'), {
          participants: [user.uid, 'remote-user-id'],
          startTime: startTimeRef.current.toISOString(),
          endTime: endTime.toISOString(),
          duration,
          mode: 'video',
          roomId,
          transcript: messages.map(m => ({ senderId: m.sender === 'You' ? user.uid : 'remote-user-id', text: m.text, timestamp: new Date().toISOString() }))
        });
      } catch (error) {
        console.error('Error saving call:', error);
      }
    }

    setInCall(false);
    setCallMode(null);
    callModeRef.current = null;
    try { recognitionRef.current?.stop(); } catch(e) {}
    setMessages([]);
    setRoomId('');
    setConnectionStatus('idle');
    iceCandidateBuffer.current = [];
    toast.info('Call ended');
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setMessages(prev => [...prev, { sender: 'You', text: inputText }]);
    socketRef.current?.emit('chat-message', { roomId, message: inputText });
    setInputText('');
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success('Room ID copied to clipboard!');
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/video-call?roomId=${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied! Send this to your partner.');
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto h-full flex flex-col">
        {!inCall ? (
          <div className="flex-1 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-neutral-900 p-12 rounded-[3rem] border border-neutral-200 dark:border-neutral-800 shadow-2xl text-center max-w-2xl w-full"
            >
              <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <Video className="w-12 h-12 text-blue-600" />
              </div>
              <h2 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">Video Call</h2>
              <p className="text-neutral-500 dark:text-neutral-400 text-lg mb-10">
                Connect with others using real-time AI sign language interpretation.
              </p>
              
              <div className="space-y-8">
                <div className="flex flex-col gap-4">
                  <h3 className="text-xl font-bold text-neutral-800 dark:text-neutral-200">Join Existing Room</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputRoomId}
                      onChange={(e) => setInputRoomId(e.target.value)}
                      placeholder="Enter Room ID"
                      className="flex-1 px-6 py-4 bg-neutral-50 dark:bg-neutral-800 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                      onClick={() => startCall(profile?.role || 'speaking', inputRoomId)}
                      disabled={!inputRoomId.trim()}
                      className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all disabled:opacity-50"
                    >
                      Join
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-200 dark:border-neutral-800"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white dark:bg-neutral-900 text-neutral-500">Or start a new one</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <button
                    onClick={() => startCall('speaking')}
                    className="group p-8 bg-neutral-50 dark:bg-neutral-800 hover:bg-blue-600 hover:text-white rounded-3xl transition-all text-left border border-neutral-200 dark:border-neutral-700 hover:border-blue-600"
                  >
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:bg-white/20 group-hover:text-white rounded-2xl flex items-center justify-center mb-4 transition-all">
                      <User className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Speaking Person</h3>
                    <p className="text-sm opacity-70">I will speak, AI will show signs to the other person.</p>
                  </button>

                  <button
                    onClick={() => startCall('deaf')}
                    className="group p-8 bg-neutral-50 dark:bg-neutral-800 hover:bg-indigo-600 hover:text-white rounded-3xl transition-all text-left border border-neutral-200 dark:border-neutral-700 hover:border-indigo-600"
                  >
                    <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 group-hover:bg-white/20 group-hover:text-white rounded-2xl flex items-center justify-center mb-4 transition-all">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Deaf/Mute Person</h3>
                    <p className="text-sm opacity-70">I will sign, AI will speak to the other person.</p>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Video Grid */}
            <div className="flex-1 flex flex-col gap-6">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Remote Video */}
                <div className="relative bg-neutral-900 rounded-[2.5rem] overflow-hidden border-4 border-white dark:border-neutral-800 shadow-xl">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {callMode === 'deaf' && (
                    <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm z-10 pointer-events-none" />
                  )}
                  {callMode === 'deaf' && (
                    <div className="absolute top-4 right-4 w-40 h-40 md:w-64 md:h-64 rounded-3xl overflow-hidden shadow-2xl border-4 border-indigo-500/50 bg-black z-20">
                      <video 
                        ref={signVideoRef}
                        className="w-full h-full object-contain"
                        muted
                        playsInline
                      />
                      <div className="absolute bottom-2 left-2 bg-indigo-600 text-[8px] font-bold text-white px-2 py-0.5 rounded uppercase">
                        AI Interpreter
                      </div>
                    </div>
                  )}
                  {callMode === 'speaking' && detectedSign && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-8 py-4 rounded-3xl border border-white/10 shadow-2xl z-20">
                      <div className="text-white text-center">
                        <span className="text-sm text-neutral-400 block mb-1">Partner Signed</span>
                        <span className="text-5xl font-bold text-indigo-400">{detectedSign}</span>
                      </div>
                    </div>
                  )}
                  {connectionStatus !== 'connected' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 bg-neutral-900/80 backdrop-blur-sm z-30">
                      <User className="w-24 h-24 mb-4 animate-pulse" />
                      <p className="font-medium">
                        {connectionStatus === 'connecting' ? 'Establishing connection...' : 'Waiting for partner...'}
                      </p>
                      {connectionStatus === 'failed' && (
                        <button 
                          onClick={() => startCall(callMode || 'speaking', roomId)}
                          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold"
                        >
                          Retry Connection
                        </button>
                      )}
                    </div>
                  )}
                  <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl text-white text-sm font-medium flex items-center gap-2 z-20">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      connectionStatus === 'connected' ? "bg-green-500 animate-pulse" : "bg-yellow-500"
                    )} />
                    Partner (Remote)
                  </div>
                </div>

                {/* Local Video */}
                <div className="relative bg-neutral-900 rounded-[2.5rem] overflow-hidden border-4 border-white dark:border-neutral-800 shadow-xl">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl text-white text-sm font-medium z-20">
                    You ({callMode === 'speaking' ? 'Speaking' : 'Deaf/Mute'})
                  </div>
                  {callMode === 'deaf' && detectedSign && (
                    <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg z-20">
                      <div className="text-white text-center">
                        <span className="text-[10px] text-neutral-400 block mb-1 uppercase">You Signed</span>
                        <span className="text-2xl font-bold text-indigo-400">{detectedSign}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="bg-white dark:bg-neutral-900 p-6 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 flex items-center justify-between px-10 shadow-lg">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-4">
                    <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl flex items-center gap-3">
                      <span className="text-sm font-bold text-neutral-500">Room ID: {roomId}</span>
                      <button onClick={copyRoomId} className="p-1 hover:text-blue-600 transition-all">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3 px-2">
                      <div className={cn("w-2 h-2 rounded-full", signalingStatus === 'connected' ? "bg-green-500" : "bg-red-500")} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        Signaling: {signalingStatus}
                      </span>
                    </div>
                    {signalingLogs.length > 0 && (
                      <div className="px-2 mt-1">
                        <p className="text-[8px] text-neutral-500 font-mono truncate max-w-[200px]">
                          {signalingLogs[signalingLogs.length - 1]}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <button
                    onClick={() => setIsMicOn(!isMicOn)}
                    className={cn(
                      "p-5 rounded-2xl transition-all",
                      isMicOn ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-600" : "bg-red-500 text-white"
                    )}
                  >
                    {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={() => setIsCameraOn(!isCameraOn)}
                    className={cn(
                      "p-5 rounded-2xl transition-all",
                      isCameraOn ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-600" : "bg-red-500 text-white"
                    )}
                  >
                    {isCameraOn ? <Camera className="w-6 h-6" /> : <CameraOff className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={endCall}
                    className="p-5 rounded-2xl bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-500/30"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex items-center gap-4">
                   <button 
                    onClick={copyInviteLink}
                    className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2"
                    title="Copy Invite Link"
                  >
                    <Share2 className="w-5 h-5" />
                    <span className="text-sm font-bold">Invite Partner</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Chat / Captions */}
            <div className="w-96 bg-white dark:bg-neutral-900 rounded-[2.5rem] border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden shadow-xl">
              <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-blue-600" />
                <h3 className="font-bold text-neutral-900 dark:text-white">Live Captions</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={cn(
                    "p-4 rounded-2xl text-sm",
                    msg.sender === 'You' ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ml-8" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 mr-8"
                  )}>
                    <span className="block text-[10px] font-bold uppercase tracking-wider opacity-50 mb-1">{msg.sender}</span>
                    {msg.text}
                  </div>
                ))}
              </div>

              <form onSubmit={sendMessage} className="p-6 border-t border-neutral-100 dark:border-neutral-800">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full pl-4 pr-12 py-3 bg-neutral-50 dark:bg-neutral-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                  />
                  <button type="submit" className="absolute right-2 p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Full-width Transcript Box at the very bottom */}
        {inCall && transcript && (
          <div className="mt-6 mb-2 flex-shrink-0">
            <div className="bg-neutral-900 p-8 rounded-[2.5rem] border-4 border-neutral-800 shadow-2xl overflow-y-auto max-h-48 min-h-[6rem] custom-scrollbar flex items-center justify-center">
              <p className="text-white text-center text-xl md:text-3xl font-bold tracking-tight leading-tight break-words px-6 drop-shadow-lg">
                {transcript}
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default VideoCall;
