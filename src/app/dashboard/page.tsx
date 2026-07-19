"use client";

import { useMemo, useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { 
  Clock, 
  MapPin, 
  Navigation, 
  CreditCard, 
  ChevronRight, 
  LogOut, 
  Loader2, 
  ShieldCheck,
  AlertCircle,
  Smartphone,
  Check,
  Car,
  Bike,
  Phone,
  Map as MapIcon,
  Wallet,
  Lock,
  Download,
  Star,
  CalendarRange,
  Banknote,
  Globe,
  Sparkles,
  LockKeyhole,
  XCircle
} from "lucide-react";
import Link from 'next/link';
import { useAuth, useUser, useCollection, useFirestore, useDoc } from '@/firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, updateDoc, doc, addDoc } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Booking, ParkingSpot } from '@/lib/types';
import { format, isAfter, differenceInMinutes } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const BIKE_RATE = 20;
const CAR_RATE = 40;
const PLATFORM_FEE = 15;

type PaymentStep = 'method' | 'razorpay' | 'verify' | 'success';

export default function UserDashboard() {
  const { user, loading: userLoading } = useUser();
  const auth = useAuth();
  const db = useFirestore();
  const { toast } = useToast();
  
  const [showSessionEnd, setShowSessionEnd] = useState(false);
  const [sessionEndStep, setSessionEndStep] = useState<PaymentStep>('method');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [otpInput, setOtpInput] = useState<{ [key: string]: string }>({});
  
  const [selectedBookingForEnd, setSelectedBookingForEnd] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  const isUpdatingExpiration = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(interval);
  }, []);

  const bookingsQuery = useMemo(() => {
    if (!user) return null;
    return query(collection(db, 'bookings'), where('userId', '==', user.uid));
  }, [db, user]);

  const { data: bookings, loading: bookingsLoading } = useCollection<Booking>(bookingsQuery);

  const activeBooking = useMemo(() => 
    bookings?.find(b => b.status === 'active' || b.status === 'pending' || b.status === 'awaiting-payment'), 
  [bookings]);

  const currentLiveAmount = useMemo(() => {
    if (!activeBooking) return 0;
    if (activeBooking.status === 'awaiting-payment') return activeBooking.totalAmount || 0;
    if (activeBooking.status === 'pending') return activeBooking.totalAmount || 0;
    if (activeBooking.isSubscription) return activeBooking.totalAmount || 0;

    const start = activeBooking.startTime ? new Date(activeBooking.startTime) : new Date();
    const diffMin = Math.max(60, differenceInMinutes(now, start));
    const hours = diffMin / 60;
    
    const baseRate = (activeBooking.bikeCount * BIKE_RATE) + (activeBooking.carCount * CAR_RATE);
    return (baseRate * hours) + PLATFORM_FEE;
  }, [activeBooking, now]);

  const spotRef = useMemo(() => 
    activeBooking ? doc(db, 'spots', activeBooking.spotId) : null,
  [db, activeBooking?.spotId]);

  const { data: activeSpot, loading: spotLoading } = useDoc<ParkingSpot>(spotRef as any);

  // Background sync for expired OTPs
  useEffect(() => {
    if (bookings) {
      bookings.forEach(booking => {
        if (booking.status === 'pending' && booking.otpExpiresAt && isAfter(now, new Date(booking.otpExpiresAt))) {
          if (!isUpdatingExpiration.current.has(booking.id)) {
            isUpdatingExpiration.current.add(booking.id);
            const bookingRef = doc(db, 'bookings', booking.id);
            
            updateDoc(bookingRef, { status: 'cancelled' })
              .then(() => {
                toast({
                  title: "Session Expired",
                  description: "The security OTP for your booking has expired.",
                  variant: "destructive"
                });
              })
              .catch(async () => {
                isUpdatingExpiration.current.delete(booking.id);
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                  path: bookingRef.path,
                  operation: 'update',
                  requestResourceData: { status: 'cancelled' }
                }));
              });
          }
        }
      });
    }
  }, [bookings, now, db, toast]);

  const pastBookings = useMemo(() => 
    bookings?.filter(b => b.status === 'completed' || b.status === 'cancelled') || [], 
  [bookings]);

  const subscriptions = useMemo(() => 
    bookings?.filter(b => b.isSubscription && b.status === 'active') || [], 
  [bookings]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleVerifyOtp = async (booking: Booking) => {
    if (booking.otpExpiresAt && isAfter(new Date(), new Date(booking.otpExpiresAt))) {
      toast({
        title: "OTP Expired",
        description: "This security code has expired.",
        variant: "destructive"
      });
      return;
    }

    const enteredOtp = otpInput[booking.id];
    if (enteredOtp === booking.otp) {
      const bookingRef = doc(db, 'bookings', booking.id);
      
      updateDoc(bookingRef, { 
        status: 'active', 
        startTime: new Date().toISOString() 
      });

      toast({
        title: "Session Started!",
        description: "Billing clock has initiated from now. You can now see location directions.",
      });
    } else {
      toast({
        title: "Invalid OTP",
        description: "The security code entered is incorrect.",
        variant: "destructive"
      });
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    updateDoc(bookingRef, { status: 'cancelled' })
      .then(() => {
        toast({
          title: "Request Declined",
          description: "Your session request has been withdrawn.",
        });
      })
      .catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: bookingRef.path,
          operation: 'update',
          requestResourceData: { status: 'cancelled' }
        }));
      });
  };

  const handleInitiateSessionEnd = (bookingId: string) => {
    setSelectedBookingForEnd(bookingId);
    setSessionEndStep('method');
    setShowSessionEnd(true);
  };

  const handleSelectMethod = (method: 'cash' | 'online') => {
    setPaymentMethod(method);
    if (method === 'online') {
      setSessionEndStep('razorpay');
    } else {
      setSessionEndStep('verify');
    }
  };

  const handleSimulateRazorpay = async () => {
    setIsProcessing(true);
    setProcessingStatus("Initializing Secure Handshake...");
    await new Promise(resolve => setTimeout(resolve, 1500));
    setProcessingStatus("AI Verifying Session Time...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    setProcessingStatus("Verifying with Gateway...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    setProcessingStatus("Payment Confirmed.");
    setIsProcessing(false);
    setSessionEndStep('verify');
  };

  const handleFinalVerifyAndLive = async () => {
    if (!selectedBookingForEnd) return;
    setIsProcessing(true);
    setProcessingStatus("Verifying Settlement with Host...");
    
    await new Promise(resolve => setTimeout(resolve, 1200));

    const bookingRef = doc(db, 'bookings', selectedBookingForEnd);
    updateDoc(bookingRef, { 
      status: 'completed', 
      totalAmount: currentLiveAmount,
      paymentId: paymentMethod === 'online' ? `RZP-${Math.random().toString(36).substring(7).toUpperCase()}` : 'CASH-SETTLED'
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: bookingRef.path,
        operation: 'update',
        requestResourceData: { status: 'completed' }
      }));
    });

    setIsProcessing(false);
    setSessionEndStep('success');
    
    toast({
      title: "Session Formally Closed",
      description: "Payment confirmed and recorded.",
    });
  };

  const closeSessionEndDialog = () => {
    setShowSessionEnd(false);
    setShowReview(true);
  };

  const handleSubmitReview = async () => {
    const booking = bookings?.find(b => b.id === selectedBookingForEnd || b.id === (bookings.find(b => b.status === 'completed')?.id));
    if (!user || !booking) return;
    setIsSubmittingReview(true);
    
    const reviewData = {
      bookingId: booking.id,
      reviewerId: user.uid,
      revieweeId: booking.hostId,
      spotId: booking.spotId,
      rating,
      comment,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'reviews'), reviewData);
      const bookingRef = doc(db, 'bookings', booking.id);
      updateDoc(bookingRef, { hasReview: true }).catch(async () => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: bookingRef.path,
          operation: 'update',
          requestResourceData: { hasReview: true }
        }));
      });
      
      toast({ title: "Review Shared!", description: "Thanks for building Tambaram trust." });
      setShowReview(false);
      setRating(0);
      setComment("");
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: "Review Error",
        description: e.message || "Could not submit review."
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const getGoogleMapsUrl = (lat: number, lng: number) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  };

  if (userLoading || (user && bookingsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-24 pb-12 px-6 text-foreground">
      <nav className="fixed top-0 w-full z-50 glass-morphism h-16 flex items-center justify-between px-6 md:px-12 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-primary-foreground">
              <Car className="w-5 h-5" />
            </div>
            <span className="font-headline text-xl font-bold tracking-tight text-white">ParkShare</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="text-white hover:bg-white/5 hidden sm:flex" asChild><Link href="/explore">Find Parking</Link></Button>
          <Button variant="outline" className="border-white/10 text-white hover:bg-white/5 hidden sm:flex" asChild><Link href="/host">Switch to Hosting</Link></Button>
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 border border-white/10">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.photoURL || ''} alt={user.displayName || 'User'} />
                    <AvatarFallback className="bg-primary/20 text-primary">{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-morphism border-white/10 text-white">
                <DropdownMenuItem asChild className="sm:hidden"><Link href="/explore">Find Parking</Link></DropdownMenuItem>
                <DropdownMenuItem asChild className="sm:hidden"><Link href="/host">Host Spot</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard">Dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive hover:bg-destructive/10"><LogOut className="mr-2 h-4 w-4" /> Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild className="rounded-xl"><Link href="/login">Sign In</Link></Button>
          )}
        </div>
      </nav>

      {user ? (
        <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <h1 className="text-4xl sm:text-5xl font-headline font-black mb-2 text-white tracking-tighter">My Activity</h1>
              <p className="text-muted-foreground font-medium">Manage your sessions and secure payments in Tambaram.</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-500 text-[10px] font-black uppercase tracking-widest">
              <ShieldCheck className="w-4 h-4" />
              Secure Transactions Active
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {activeBooking ? (
                <Card className={`border-primary/40 bg-primary/5 glass-morphism overflow-hidden relative rounded-[2.5rem] p-6 sm:p-10 ${activeBooking.status === 'pending' ? 'border-orange-500/40 shadow-[0_0_30px_rgba(249,115,22,0.1)]' : ''}`}>
                  <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none">
                     <Navigation className="w-48 h-48 text-primary" />
                  </div>
                  <CardHeader className="p-0 mb-10">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                       <div>
                          <CardTitle className="font-headline text-3xl font-black text-white">
                            {activeBooking.isSubscription ? 'Monthly Commute' : 'Live Session'}
                          </CardTitle>
                          <div className="flex flex-wrap gap-2 mt-3">
                             {activeBooking.bikeCount > 0 && <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/20 gap-1.5 px-3 py-1 font-bold text-[10px]"><Bike className="w-3 h-3"/> {activeBooking.bikeCount} Bike(s)</Badge>}
                             {activeBooking.carCount > 0 && <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/20 gap-1.5 px-3 py-1 font-bold text-[10px]"><Car className="w-3 h-3"/> {activeBooking.carCount} Car(s)</Badge>}
                          </div>
                       </div>
                       <Badge className={`px-4 py-1.5 rounded-xl font-black text-[10px] tracking-widest ${activeBooking.status === 'active' ? 'bg-green-500' : activeBooking.status === 'awaiting-payment' ? 'bg-blue-600' : 'bg-orange-500 animate-pulse'}`}>
                          {activeBooking.status.toUpperCase().replace('-', ' ')}
                       </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0 space-y-10">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Started At</p>
                        <p className="text-2xl font-black text-white flex items-center gap-2">
                          <Clock className="w-5 h-5 text-primary opacity-60" /> 
                          {activeBooking.status === 'pending' || !activeBooking.startTime ? '--:--' : format(new Date(activeBooking.startTime), 'HH:mm')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Live Billing</p>
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-black text-primary">₹{currentLiveAmount.toFixed(2)}</p>
                          {activeBooking.status === 'active' && <Sparkles className="w-3 h-3 text-primary animate-pulse" />}
                        </div>
                        <p className="text-[9px] text-muted-foreground font-bold italic uppercase tracking-tighter opacity-70">{activeBooking.status === 'awaiting-payment' ? 'Final charge' : 'Updating in real-time'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">Handshake Status</p>
                        {activeBooking.status === 'pending' ? (
                          <div className="flex flex-col gap-1">
                            <p className="text-xs font-black text-orange-500 flex items-center gap-2">
                              <LockKeyhole className="w-4 h-4" /> Call Host for Code
                            </p>
                            <p className="text-[9px] text-muted-foreground font-medium italic">Handshake required to unlock location</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <p className="text-xl font-headline font-black text-green-500 flex items-center gap-2">
                              <Check className="w-5 h-5" strokeWidth={3} /> Verified
                            </p>
                            <p className="text-[10px] text-muted-foreground font-medium italic">Identity Confirmed</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white/5 p-6 sm:p-8 rounded-[2rem] border border-white/10 relative overflow-hidden group hover:border-primary/30 transition-all">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
                        <div className="flex items-center gap-5">
                           <div className="w-16 h-16 rounded-[1.25rem] bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-xl group-hover:scale-105 transition-transform">
                              <Phone className="w-8 h-8" />
                           </div>
                           <div>
                              <p className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] mb-1.5">Host Support</p>
                              {spotLoading ? (
                                <Skeleton className="h-6 w-32 bg-white/10" />
                              ) : activeSpot ? (
                                <div>
                                  <p className="text-2xl font-black text-white mb-1 tracking-tight">{activeSpot.phone}</p>
                                  {activeBooking.status !== 'pending' ? (
                                    <p className="text-xs text-primary font-bold flex items-center gap-1.5 uppercase tracking-tight">
                                      <MapPin className="w-3.5 h-3.5" /> {activeSpot.address}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest flex items-center gap-1.5">
                                      <Lock className="w-3 h-3" /> Location hidden until arrival
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground italic">Host details encrypted</p>
                              )}
                           </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                          {activeSpot?.phone && (
                            <Button className="h-14 px-8 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg shadow-primary/20 active:scale-95 transition-all" asChild>
                               <a href={`tel:${activeSpot.phone}`}>
                                <Phone className="w-4 h-4 mr-2" />
                                Call Host
                               </a>
                            </Button>
                          )}
                          {activeSpot && activeBooking.status !== 'pending' && (
                            <Button variant="outline" className="h-14 px-8 rounded-2xl border-white/20 text-white font-black hover:bg-white/10 active:scale-95 transition-all" asChild>
                               <a 
                                 href={getGoogleMapsUrl(activeSpot.lat, activeSpot.lng)} 
                                 target="_blank" 
                                 rel="noopener noreferrer"
                               >
                                <Navigation className="w-4 h-4 mr-2" />
                                Navigation
                               </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-6 pt-6">
                      {activeBooking.status === 'pending' ? (
                        <div className="space-y-8 animate-in slide-in-from-bottom-2">
                          <div className="flex items-start gap-4 text-orange-500 bg-orange-500/5 p-6 rounded-2xl border border-orange-500/10">
                            <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                            <p className="text-sm font-bold leading-relaxed">Safety Protocol: Please provide the host with your identity for the 4-digit security code. Enter it below to unlock full location details and start billing.</p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="relative">
                                <LockKeyhole className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-primary opacity-40" />
                                <Input 
                                  placeholder="----" 
                                  className="glass-morphism h-16 pl-14 text-center text-3xl tracking-[12px] font-black text-white border-white/10 rounded-[1.25rem] focus:ring-primary/50" 
                                  value={otpInput[activeBooking.id] || ''} 
                                  maxLength={4} 
                                  onChange={e => setOtpInput({...otpInput, [activeBooking.id]: e.target.value})} 
                                />
                             </div>
                             <div className="flex flex-col gap-3">
                               <Button 
                                className="h-16 rounded-[1.25rem] font-black text-xl bg-primary text-primary-foreground shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all" 
                                onClick={() => handleVerifyOtp(activeBooking)}
                               >
                                  Authorize Handshake
                               </Button>
                               <Button 
                                variant="ghost" 
                                className="h-12 text-destructive hover:bg-destructive/10 font-black gap-2 uppercase tracking-widest text-[10px]"
                                onClick={() => handleCancelBooking(activeBooking.id)}
                               >
                                 <XCircle className="w-4 h-4" />
                                 Decline Request
                               </Button>
                             </div>
                          </div>
                        </div>
                      ) : activeBooking.status === 'awaiting-payment' ? (
                        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                          <Button 
                            className="w-full h-16 bg-primary text-primary-foreground font-black text-xl rounded-[1.25rem] shadow-[0_0_30px_rgba(128,123,255,0.4)] hover:shadow-primary/50 transition-all active:scale-95" 
                            onClick={() => handleInitiateSessionEnd(activeBooking.id)}
                          >
                            <Wallet className="w-6 h-6 mr-3" />
                            Pay & Terminate Session
                          </Button>
                          <p className="text-center text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] opacity-60">Verified Settlement Required</p>
                        </div>
                      ) : activeBooking.status === 'active' ? (
                        <div className="p-6 rounded-[1.25rem] bg-primary/10 border border-primary/20 flex items-center justify-between gap-4 text-primary">
                           <div className="flex items-center gap-3">
                              <Clock className="w-6 h-6 animate-pulse" />
                              <p className="text-sm font-black uppercase tracking-widest">Live Tracking Active</p>
                           </div>
                           <p className="text-[10px] text-muted-foreground font-bold italic">Wait for Host to end session</p>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed border-white/10 bg-white/5 glass-morphism rounded-[3rem]">
                  <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-8">
                    <div className="w-24 h-24 rounded-[2rem] bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                      <Car className="w-12 h-12 text-muted-foreground opacity-30" />
                    </div>
                    <div>
                      <h3 className="font-black text-3xl text-white tracking-tight">No Active Sessions</h3>
                      <p className="text-muted-foreground max-w-xs mx-auto mt-3 font-medium">Discover and book premium verified spots in Tambaram Hub.</p>
                    </div>
                    <Button size="lg" className="rounded-2xl px-12 h-16 font-black text-lg active:scale-95 transition-all" asChild><Link href="/explore">Find a Spot</Link></Button>
                  </CardContent>
                </Card>
              )}

              <Tabs defaultValue="history" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-white/5 p-1 rounded-2xl border border-white/5">
                  <TabsTrigger value="active" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] font-black tracking-widest uppercase">Live</TabsTrigger>
                  <TabsTrigger value="subscriptions" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] font-black tracking-widest uppercase">Plans</TabsTrigger>
                  <TabsTrigger value="history" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] font-black tracking-widest uppercase">Logs</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="pt-6">
                   <div className="p-16 text-center text-muted-foreground glass-morphism rounded-[2.5rem] border-white/10 font-bold uppercase text-[10px] tracking-widest opacity-60">
                      No additional pending sessions.
                   </div>
                </TabsContent>
                <TabsContent value="subscriptions" className="pt-6 space-y-4">
                  {subscriptions.length > 0 ? (
                    subscriptions.map(sub => (
                      <Card key={sub.id} className="glass-morphism border-primary/20 bg-primary/5 rounded-[1.5rem] p-8">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20 shadow-xl">
                              <CalendarRange className="w-7 h-7" />
                            </div>
                            <div>
                              <h4 className="font-black text-xl text-white tracking-tight">Monthly Commute Plan</h4>
                              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Tambaram Hub • Renews {sub.startTime ? format(new Date(sub.startTime), 'MMM dd') : 'Soon'}</p>
                            </div>
                          </div>
                          <Badge className="bg-green-500 px-4 py-1.5 rounded-xl font-black text-[10px] tracking-widest">ACTIVE</Badge>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="p-16 text-center text-muted-foreground glass-morphism rounded-[2.5rem] border-white/10 font-bold uppercase text-[10px] tracking-widest opacity-60">
                      No active monthly plans.
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="history" className="pt-6">
                  <Card className="glass-morphism border-white/10 rounded-[2.5rem] overflow-hidden">
                    <CardContent className="p-0">
                      {pastBookings.length ? (
                        pastBookings.map(b => (
                          <div key={b.id} className="flex items-center justify-between p-8 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all group">
                             <div className="space-y-2">
                                <h4 className="font-black text-lg text-white flex items-center gap-2">
                                  {b.status === 'cancelled' ? 'Expired Handshake' : 'Verified Session'}
                                  {b.status === 'completed' && <ShieldCheck className="w-4 h-4 text-green-500" strokeWidth={3} />}
                                </h4>
                                <div className="flex flex-wrap gap-3 items-center">
                                   <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{b.startTime ? format(new Date(b.startTime), 'MMM dd, yyyy') : 'No Date'}</p>
                                   <div className="flex gap-2.5 opacity-60">
                                      {b.bikeCount > 0 && <span className="text-[10px] font-bold flex items-center gap-1"><Bike className="w-3 h-3"/> {b.bikeCount}</span>}
                                      {b.carCount > 0 && <span className="text-[10px] font-bold flex items-center gap-1"><Car className="w-3 h-3"/> {b.carCount}</span>}
                                   </div>
                                </div>
                             </div>
                             <div className="text-right flex items-center gap-8">
                                <div>
                                   <p className="font-black text-2xl text-white mb-1">₹{b.totalAmount?.toFixed(2)}</p>
                                   <Badge variant="outline" className={`text-[9px] font-black tracking-widest px-3 py-0.5 rounded-lg ${b.status === 'cancelled' ? 'text-destructive border-destructive/30' : 'text-green-500 border-green-500/30'}`}>
                                      {b.status === 'cancelled' ? 'EXPIRED' : 'SETTLED'}
                                   </Badge>
                                </div>
                                <ChevronRight className="w-6 h-6 text-muted-foreground group-hover:text-white transition-colors" />
                             </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-20 text-center text-muted-foreground font-bold uppercase text-[10px] tracking-widest opacity-60">Your history is empty.</div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-8">
              <Card className="glass-morphism border-white/10 rounded-[2.5rem] overflow-hidden">
                <CardHeader className="bg-white/5 border-b border-white/5 pb-6">
                  <CardTitle className="text-xl font-headline font-black text-white flex items-center gap-2 uppercase tracking-tighter">
                    <CreditCard className="w-5 h-5 text-primary" /> Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-8">
                  <div className="p-6 rounded-[1.5rem] bg-white/5 border border-white/5 flex justify-between items-center group hover:border-primary/40 transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-2xl bg-primary/20 shadow-xl">
                         <CreditCard className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">Visa •••• 4242</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Encrypted</p>
                      </div>
                    </div>
                    <Lock className="w-4 h-4 text-muted-foreground opacity-30" />
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground uppercase font-black tracking-[0.2em] justify-center py-3 bg-white/5 rounded-2xl border border-white/5">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-500" /> SSL SECURE 256-BIT
                  </div>
                  <Button variant="outline" className="w-full h-14 rounded-2xl border-white/10 text-white font-black hover:bg-white/10 transition-all active:scale-95">Manage Funds</Button>
                </CardContent>
              </Card>

              <Card className="glass-morphism border-primary/20 bg-primary/5 rounded-[2.5rem] p-10 overflow-hidden relative shadow-2xl">
                  <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none">
                     <ShieldCheck className="w-32 h-32 text-primary" />
                  </div>
                  <h3 className="font-headline font-black text-white text-xl mb-4 tracking-tight">ParkShare Trust</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed font-medium mb-8">
                    All settlements are routed via Razorpay's PCI-DSS compliant infrastructure. Funds are held in escrow until the verified host-renter handshake is complete.
                  </p>
                  <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                     <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                     <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Network Secure</span>
                  </div>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto flex flex-col items-center justify-center py-40 text-center space-y-10 animate-in fade-in zoom-in duration-1000">
           <div className="w-24 h-24 rounded-[2.5rem] bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-2xl">
              <Car className="w-12 h-12" />
           </div>
           <div className="space-y-4">
              <h2 className="text-5xl font-headline font-black text-white tracking-tighter">Renter Hub</h2>
              <p className="text-muted-foreground text-xl max-w-sm mx-auto font-medium">Sign in to manage your parking sessions and secure verified payments.</p>
           </div>
           <Button size="lg" className="rounded-[1.5rem] px-16 h-18 text-xl font-black shadow-2xl shadow-primary/30 active:scale-95 transition-all" asChild><Link href="/login">Authenticate</Link></Button>
        </div>
      )}

      {/* Unified Session End & Payment Dialog */}
      <Dialog open={showSessionEnd} onOpenChange={setShowSessionEnd}>
         <DialogContent className="glass-morphism border-white/10 text-white rounded-[2.5rem] max-w-md p-0 overflow-hidden outline-none shadow-2xl">
            <DialogTitle className="sr-only">Session Settlement</DialogTitle>
            <DialogDescription className="sr-only">Choose your payment method and verify the transaction.</DialogDescription>
            
            {sessionEndStep === 'method' && (
              <div className="p-10 space-y-8 animate-in fade-in zoom-in duration-300">
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 bg-primary/10 rounded-[1.5rem] flex items-center justify-center mx-auto text-primary mb-6 border border-primary/20 shadow-xl">
                    <Banknote className="w-10 h-10" />
                  </div>
                  <h2 className="text-3xl font-headline font-black tracking-tight">Settle Payment</h2>
                  <p className="text-sm text-muted-foreground font-medium">Select your preferred settlement method.</p>
                </div>

                <div className="grid gap-5">
                  <Button 
                    variant="outline" 
                    className="h-24 border-white/10 rounded-[1.5rem] justify-between px-8 hover:bg-primary/5 hover:border-primary/40 group transition-all"
                    onClick={() => handleSelectMethod('online')}
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                        <Globe className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="text-left">
                        <p className="font-black text-lg text-white">Online Portal</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black opacity-60">UPI, Card, Razorpay</p>
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 opacity-40 group-hover:translate-x-1 transition-transform" />
                  </Button>

                  <Button 
                    variant="outline" 
                    className="h-24 border-white/10 rounded-[1.5rem] justify-between px-8 hover:bg-primary/5 hover:border-primary/40 group transition-all"
                    onClick={() => handleSelectMethod('cash')}
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                        <Banknote className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="text-left">
                        <p className="font-black text-lg text-white">Cash Settlement</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black opacity-60">Direct Hand-to-Hand</p>
                      </div>
                    </div>
                    <ChevronRight className="w-6 h-6 opacity-40 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>
            )}

            {sessionEndStep === 'razorpay' && (
              <div className="animate-in fade-in zoom-in duration-300">
                <div className="bg-[#12141a] p-8 flex items-center justify-between border-b border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-[0_0_15px_rgba(37,99,235,0.5)]">R</div>
                    <div className="flex flex-col">
                      <span className="font-black text-[10px] tracking-[0.2em] text-white/40 uppercase">Secured by</span>
                      <span className="font-black text-lg tracking-tighter text-white/90 uppercase">Razorpay</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-60">Payable</p>
                    <p className="text-2xl font-black text-primary tracking-tight">₹{currentLiveAmount.toFixed(2)}</p>
                  </div>
                </div>
                
                <div className="p-10 space-y-8">
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Linked Instruments</p>
                    
                    <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/40 cursor-pointer transition-all group hover:bg-primary/5">
                      <div className="flex items-center gap-4">
                        <CreditCard className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                        <span className="text-sm font-black text-white/90">Visa ending in 4242</span>
                      </div>
                      <Badge variant="outline" className="text-[8px] font-black bg-primary/10 text-primary border-primary/20 rounded-md">DEFAULT</Badge>
                    </div>

                    <div className="flex items-center justify-between p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-primary/40 cursor-pointer transition-all group hover:bg-primary/5">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-[9px] font-black text-white italic">UPI</div>
                        <span className="text-sm font-black text-white/90">renter@ybl</span>
                      </div>
                      <Smartphone className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  
                  <div className="bg-primary/5 p-6 rounded-[1.25rem] border border-primary/10 space-y-3">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-muted-foreground">Parking Charge</span>
                      <span className="text-white">₹{currentLiveAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="text-white">₹{PLATFORM_FEE.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-black pt-4 border-t border-white/10">
                      <span className="text-white uppercase tracking-widest text-[10px]">Total Amount</span>
                      <span className="text-primary text-xl">₹{currentLiveAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <Button 
                      className="w-full h-16 bg-primary text-primary-foreground font-black text-lg rounded-[1.25rem] shadow-[0_8px_30px_rgba(128,123,255,0.4)] active:scale-[0.98] transition-all" 
                      onClick={handleSimulateRazorpay} 
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <div className="flex items-center gap-3">
                          <Loader2 className="animate-spin w-6 h-6" />
                          <span className="text-xs uppercase tracking-widest font-black">{processingStatus || "Authorizing..."}</span>
                        </div>
                      ) : (
                        `Authorize Payment • ₹${currentLiveAmount.toFixed(2)}`
                      )}
                    </Button>
                    <div className="flex items-center justify-center gap-3 opacity-60">
                      <Lock className="w-3.5 h-3.5 text-green-500" />
                      <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">PCI-DSS Level 1 Compliant</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {sessionEndStep === 'verify' && (
              <div className="p-12 text-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-24 h-24 bg-green-500/10 rounded-[2rem] flex items-center justify-center mx-auto text-green-500 border border-green-500/20 shadow-xl">
                   <ShieldCheck className="w-12 h-12" strokeWidth={3} />
                </div>
                
                <div className="space-y-4">
                  <h2 className="text-3xl font-headline font-black tracking-tight text-white">Verify Receipt</h2>
                  <p className="text-sm text-muted-foreground px-6 font-medium leading-relaxed">
                    Safety Handshake: Please confirm if the {paymentMethod === 'online' ? 'digital transfer' : 'cash settlement'} has been successfully received by the host. 
                  </p>
                </div>

                <div className="grid gap-4 pt-4">
                  <Button 
                    className="h-16 bg-green-500 hover:bg-green-600 text-white font-black text-xl rounded-[1.25rem] shadow-[0_10px_30px_rgba(34,197,94,0.3)] active:scale-95 transition-all"
                    onClick={handleFinalVerifyAndLive}
                    disabled={isProcessing}
                  >
                    {isProcessing ? <Loader2 className="animate-spin w-6 h-6" /> : "Yes, Payment Settled"}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="h-14 text-muted-foreground font-black uppercase tracking-widest text-[10px] hover:text-white"
                    onClick={() => setSessionEndStep('method')}
                  >
                    No, Return to Portal
                  </Button>
                </div>
              </div>
            )}

            {sessionEndStep === 'success' && (
              <div className="p-16 text-center space-y-10 animate-in fade-in zoom-in duration-500">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full scale-150 animate-pulse-slow"></div>
                  <div className="w-28 h-28 bg-green-500 rounded-full flex items-center justify-center mx-auto relative z-10 border-8 border-[#0b0a0f] shadow-[0_0_40px_rgba(34,197,94,0.5)]">
                    <Check className="w-14 h-14 text-white" strokeWidth={4} />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h2 className="text-4xl font-headline font-black text-white tracking-tighter">Session Terminated</h2>
                  <p className="text-muted-foreground text-sm max-w-[280px] mx-auto font-medium">Payment verified and handshake logs finalized.</p>
                </div>
                
                <div className="bg-white/5 p-8 rounded-[1.5rem] border border-white/10 space-y-6 text-left">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground uppercase font-black tracking-[0.2em]">Asset Release</span>
                    <span className="font-black text-green-500 uppercase">IMMEDIATE</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-white/10 pt-6">
                    <span className="text-muted-foreground uppercase font-black tracking-widest text-[10px]">Total Settled</span>
                    <span className="font-black text-primary text-2xl tracking-tight">₹{currentLiveAmount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-5 pt-4">
                  <Button variant="outline" className="flex-1 h-14 rounded-2xl border-white/10 text-white font-black hover:bg-white/10 active:scale-95 transition-all" onClick={closeSessionEndDialog}>
                    Dismiss
                  </Button>
                  <Button className="flex-1 h-14 rounded-2xl bg-white/10 text-white hover:bg-white/20 font-black gap-2 active:scale-95 transition-all">
                    <Download className="w-5 h-5" />
                    Receipt
                  </Button>
                </div>
              </div>
            )}
         </DialogContent>
      </Dialog>

      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="glass-morphism border-white/10 text-white rounded-[2.5rem] max-w-md p-10 shadow-2xl">
          <DialogTitle className="text-3xl font-headline font-black text-center tracking-tight mb-2">Rate Experience</DialogTitle>
          <DialogDescription className="text-center text-muted-foreground font-medium mb-8">Help build a safer Tambaram parking network.</DialogDescription>
          
          <div className="space-y-8">
            <div className="flex justify-center gap-4">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRating(s)} className={`transition-all duration-300 ${rating >= s ? 'text-yellow-500 scale-125 drop-shadow-[0_0_10px_rgba(234,179,8,0.4)]' : 'text-white/10 hover:text-white/30'}`}>
                  <Star className={`w-10 h-10 ${rating >= s ? 'fill-current' : ''}`} strokeWidth={2.5} />
                </button>
              ))}
            </div>
            
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-70 ml-1">Asset Comments</p>
              <Textarea 
                placeholder="Secure access? Professional host? Share details..." 
                className="bg-white/5 border-white/10 rounded-[1.25rem] min-h-[120px] text-white focus:ring-primary/50 text-base py-4 px-5"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
            </div>

            <Button 
              className="w-full h-16 bg-primary font-black text-xl rounded-[1.25rem] shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all" 
              onClick={handleSubmitReview}
              disabled={isSubmittingReview || rating === 0}
            >
              {isSubmittingReview ? <Loader2 className="animate-spin w-7 h-7" /> : 'Submit Feedback'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
