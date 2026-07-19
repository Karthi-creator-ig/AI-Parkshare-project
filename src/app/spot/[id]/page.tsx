"use client";

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  MapPin, 
  ArrowLeft, 
  Heart, 
  Share2, 
  Loader2, 
  Clock, 
  Timer, 
  ChevronLeft, 
  ChevronRight, 
  Car, 
  Bike, 
  Plus, 
  Minus, 
  AlertCircle, 
  CalendarRange,
  Calendar as CalendarIcon,
  ShieldCheck,
  Zap,
  Phone,
  ArrowRight,
  Star,
  Lock,
  Smartphone
} from "lucide-react";
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useDoc, useCollection } from '@/firebase';
import { doc, collection, addDoc, query, where } from 'firebase/firestore';
import { ParkingSpot, Review } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import Link from 'next/link';
import { format, addHours, isAfter, setHours, setMinutes } from 'date-fns';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';

const BIKE_RATE = 20;
const CAR_RATE = 40;
const BIKE_MONTHLY = 2500;
const CAR_MONTHLY = 5000;
const PLATFORM_FEE = 15;

export default function SpotDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [isBooking, setIsBooking] = useState(false);
  const [bookingMode, setBookingMode] = useState<'hourly' | 'monthly'>('hourly');
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedHour, setSelectedHour] = useState<string>("12");
  const [selectedMinute, setSelectedMinute] = useState<string>("00");
  
  const [duration, setDuration] = useState<string>("1"); 
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  
  const [bikeCount, setBikeCount] = useState(0);
  const [carCount, setCarCount] = useState(1);
  
  const db = useFirestore();
  const { user } = useUser();
  
  const spotRef = useMemo(() => id ? doc(db, 'spots', id as string) : null, [db, id]);
  const { data: spot, loading: spotLoading } = useDoc<ParkingSpot>(spotRef as any);

  const reviewsQuery = useMemo(() => {
    if (!id) return null;
    return query(collection(db, 'reviews'), where('spotId', '==', id));
  }, [db, id]);
  const { data: reviews } = useCollection<Review>(reviewsQuery);

  const avgRating = useMemo(() => {
    if (!reviews || reviews.length === 0) return 0;
    return reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
  }, [reviews]);

  const fallbackImage = PlaceHolderImages[0].imageUrl;

  const isOwner = useMemo(() => {
    return user && spot && user.uid === spot.ownerId;
  }, [user, spot]);

  const hoursOptions = Array.from({ length: 24 }, (_, i) => ({
    label: i.toString().padStart(2, '0'),
    value: i.toString(),
  }));

  const minutesOptions = ["00", "15", "30", "45"].map(m => ({
    label: m,
    value: m
  }));

  const durationOptions = Array.from({ length: 24 }, (_, i) => ({
    label: `${i + 1} Hour${i + 1 > 1 ? 's' : ''}`,
    value: (i + 1).toString(),
  }));

  const durationNum = parseInt(duration);
  const hourlyTotal = (bikeCount * BIKE_RATE) + (carCount * CAR_RATE);
  const monthlyTotal = (bikeCount * BIKE_MONTHLY) + (carCount * CAR_MONTHLY);
  
  const totalParkingCost = bookingMode === 'hourly' 
    ? hourlyTotal * durationNum 
    : monthlyTotal;
    
  const grandTotal = totalParkingCost > 0 ? totalParkingCost + PLATFORM_FEE : 0;

  const handleBooking = () => {
    if (!user) {
      toast({ title: "Authentication Required", description: "Sign in to access the Tambaram hub.", variant: "destructive" });
      router.push('/login');
      return;
    }
    if (!spot || !selectedDate) return;
    if (isOwner) {
      toast({ title: "Ownership Lock", description: "Hosts cannot book their own listings.", variant: "destructive" });
      return;
    }
    if (bikeCount === 0 && carCount === 0) {
      toast({ title: "Asset Selection", description: "Please select a vehicle type.", variant: "destructive" });
      return;
    }

    setIsBooking(true);
    
    const startTimeDate = new Date(selectedDate);
    startTimeDate.setHours(parseInt(selectedHour));
    startTimeDate.setMinutes(parseInt(selectedMinute));
    startTimeDate.setSeconds(0);
    startTimeDate.setMilliseconds(0);

    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const endTimeDate = bookingMode === 'hourly' ? addHours(startTimeDate, durationNum) : addHours(startTimeDate, 720); 
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const bookingData = {
      spotId: id,
      userId: user.uid,
      hostId: spot.ownerId,
      startTime: startTimeDate.toISOString(),
      endTime: endTimeDate.toISOString(),
      status: 'pending',
      totalAmount: grandTotal,
      bikeCount: bikeCount,
      carCount: carCount,
      isSubscription: bookingMode === 'monthly',
      otp: generatedOtp,
      otpExpiresAt: otpExpiresAt,
      createdAt: new Date().toISOString()
    };

    addDoc(collection(db, 'bookings'), bookingData)
      .then(() => {
        toast({ title: "Request Initialized!", description: `Escrow request sent for ${bikeCount} bikes and ${carCount} cars.` });
        router.push('/dashboard');
      })
      .catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ 
          path: 'bookings', 
          operation: 'create', 
          requestResourceData: bookingData 
        }));
      })
      .finally(() => setIsBooking(false));
  };

  const handlePrevPhoto = () => {
    const len = spot?.imageUrls?.length || 0;
    if (len === 0) return;
    setActivePhotoIdx(prev => (prev === 0 ? len - 1 : prev - 1));
  };

  const handleNextPhoto = () => {
    const len = spot?.imageUrls?.length || 0;
    if (len === 0) return;
    setActivePhotoIdx(prev => (prev === len - 1 ? 0 : prev + 1));
  };

  if (spotLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-primary w-12 h-12" strokeWidth={3} /></div>;
  if (!spot) return <div className="min-h-screen flex items-center justify-center font-black uppercase tracking-[0.2em] text-muted-foreground opacity-60">Asset not found</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="fixed top-0 w-full z-50 glass-morphism h-16 flex items-center justify-between px-6 md:px-12 border-b border-white/5">
        <Link href="/explore" className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest hover:text-primary transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
          Back to Grid
        </Link>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="rounded-xl hover:bg-white/5 text-white"><Share2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="rounded-xl hover:bg-white/5 text-white"><Heart className="w-4 h-4" /></Button>
        </div>
      </nav>

      <div className="container px-6 py-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-12">
            <div className="space-y-6">
              <div className="relative aspect-video sm:aspect-[16/9] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] group">
                <Image 
                  src={spot.imageUrls?.[activePhotoIdx] || spot.imageUrls?.[0] || fallbackImage} 
                  alt={spot.name} 
                  fill 
                  className="object-cover transition-all duration-700 group-hover:scale-[1.02]" 
                  priority
                />
                <div className="absolute inset-x-0 bottom-6 flex justify-center gap-2 z-10">
                   {spot.imageUrls?.map((_, idx) => (
                     <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${idx === activePhotoIdx ? 'w-8 bg-primary' : 'w-2 bg-white/30'}`} />
                   ))}
                </div>
                {spot.verified && <Badge className="absolute top-8 left-8 bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-widest px-4 py-1 rounded-xl shadow-2xl">AI Certified</Badge>}
                
                <button 
                  onClick={handlePrevPhoto}
                  className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-black/40 backdrop-blur-md hover:bg-black/60 transition-all active:scale-90"
                >
                  <ChevronLeft className="text-white w-6 h-6" />
                </button>
                <button 
                  onClick={handleNextPhoto}
                  className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-black/40 backdrop-blur-md hover:bg-black/60 transition-all active:scale-90"
                >
                  <ChevronRight className="text-white w-6 h-6" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-4 sm:gap-6">
                 {spot.imageUrls?.map((url, idx) => (
                   <div 
                    key={idx} 
                    className={`relative aspect-square rounded-[1.25rem] overflow-hidden cursor-pointer border-4 transition-all duration-300 ${idx === activePhotoIdx ? 'border-primary shadow-lg scale-95' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-[1.02]'}`}
                    onClick={() => setActivePhotoIdx(idx)}
                   >
                     <Image src={url || fallbackImage} alt={`Asset View ${idx + 1}`} fill className="object-cover" />
                   </div>
                 ))}
              </div>
            </div>

            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4 bg-white/5 p-4 rounded-[1.5rem] border border-white/5 w-fit">
                   <Avatar className="w-12 h-12 border-2 border-primary/30">
                      <AvatarFallback className="bg-primary/20 text-primary font-black">{spot.ownerName?.charAt(0) || 'H'}</AvatarFallback>
                   </Avatar>
                   <div>
                      <p className="text-[9px] uppercase font-black text-muted-foreground tracking-[0.2em] mb-0.5">Asset Proprietor</p>
                      <p className="text-base font-black text-white uppercase tracking-tight">{spot.ownerName || 'Host'}</p>
                   </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
                  <div className="space-y-3">
                    <h1 className="text-4xl sm:text-6xl font-headline font-black text-white tracking-tighter uppercase leading-none">{spot.name}</h1>
                    <div className="flex flex-wrap gap-4 items-center text-muted-foreground">
                      <div className="flex items-center gap-2 font-black uppercase text-[10px] tracking-widest text-primary/80">
                        <MapPin className="w-4 h-4" /> 
                        <span>{spot.address}</span>
                      </div>
                      <Badge variant="outline" className="border-primary/20 text-primary font-black uppercase text-[9px] tracking-widest px-3 py-0.5 rounded-lg">Tambaram Hub</Badge>
                    </div>
                  </div>
                  
                  {avgRating > 0 && (
                    <div className="flex flex-col items-end gap-1 bg-white/5 p-4 rounded-2xl border border-white/5 shadow-xl">
                      <div className="flex items-center gap-2 text-yellow-500">
                        <span className="font-black text-3xl tracking-tighter">{avgRating.toFixed(1)}</span>
                        <Star className="w-6 h-6 fill-current" strokeWidth={2.5} />
                      </div>
                      <span className="text-[9px] text-muted-foreground font-black uppercase tracking-[0.2em] opacity-60">{reviews?.length} Marketplace Reviews</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator className="bg-white/5" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="bg-white/5 border-white/5 rounded-[2rem] p-8 group hover:border-primary/40 transition-all shadow-xl">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><Bike className="w-7 h-7" /></div>
                    <h3 className="font-black text-xl text-white uppercase tracking-tight">Bike Tier</h3>
                  </div>
                  <div className="space-y-2">
                    <p className="text-3xl font-black text-white tracking-tighter">₹{BIKE_RATE}<span className="text-xs text-muted-foreground font-bold ml-1 uppercase">/ hr</span></p>
                    <div className="flex items-center gap-2">
                       <p className="text-sm font-black text-primary uppercase tracking-tighter">₹{BIKE_MONTHLY.toLocaleString()}<span className="text-[10px] text-muted-foreground font-bold ml-1 uppercase">/ month</span></p>
                       <Zap className="w-3 h-3 text-primary animate-pulse" />
                    </div>
                  </div>
                </Card>
                <Card className="bg-white/5 border-white/5 rounded-[2rem] p-8 group hover:border-primary/40 transition-all shadow-xl">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform"><Car className="w-7 h-7" /></div>
                    <h3 className="font-black text-xl text-white uppercase tracking-tight">Car Tier</h3>
                  </div>
                  <div className="space-y-2">
                    <p className="text-3xl font-black text-white tracking-tighter">₹{CAR_RATE}<span className="text-xs text-muted-foreground font-bold ml-1 uppercase">/ hr</span></p>
                    <div className="flex items-center gap-2">
                       <p className="text-sm font-black text-primary uppercase tracking-tighter">₹{CAR_MONTHLY.toLocaleString()}<span className="text-[10px] text-muted-foreground font-bold ml-1 uppercase">/ month</span></p>
                       <Zap className="w-3 h-3 text-primary animate-pulse" />
                    </div>
                  </div>
                </Card>
              </div>

              <div className="space-y-6">
                <h3 className="text-2xl font-headline font-black text-white tracking-tighter uppercase">Operational Notes</h3>
                <p className="text-muted-foreground text-lg leading-relaxed font-medium">{spot.description}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                   <div className="flex flex-col gap-1 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <ShieldCheck className="w-5 h-5 text-primary mb-1" />
                      <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Verified</span>
                   </div>
                   <div className="flex flex-col gap-1 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <Clock className="w-5 h-5 text-primary mb-1" />
                      <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">24/7 Access</span>
                   </div>
                   <div className="flex flex-col gap-1 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <Lock className="w-5 h-5 text-primary mb-1" />
                      <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Secured</span>
                   </div>
                   <div className="flex flex-col gap-1 p-4 bg-white/5 rounded-2xl border border-white/5">
                      <Smartphone className="w-5 h-5 text-primary mb-1" />
                      <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">App Auth</span>
                   </div>
                </div>
              </div>

              {reviews && reviews.length > 0 && (
                <div className="pt-10">
                  <h3 className="text-2xl font-headline font-black mb-8 text-white tracking-tighter uppercase">Marketplace Logs</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {reviews.map(r => (
                      <div key={r.id} className="p-8 rounded-[2rem] bg-white/5 border border-white/5 space-y-4 hover:border-white/10 transition-all shadow-xl group">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-1.5 text-yellow-500">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className={`w-3.5 h-3.5 ${i < r.rating ? 'fill-current' : 'fill-white/10 text-white/10'}`} />
                            ))}
                          </div>
                          <span className="text-[9px] text-muted-foreground uppercase font-black tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">{format(new Date(r.createdAt), 'MMM dd, yyyy')}</span>
                        </div>
                        <p className="text-sm text-white/80 leading-relaxed font-medium italic">"{r.comment}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            <Card className="glass-morphism border-primary/40 lg:sticky lg:top-24 rounded-[2.5rem] shadow-[0_30px_90px_rgba(0,0,0,0.5)] overflow-hidden">
              <CardHeader className="bg-white/5 border-b border-white/5 py-8 px-8">
                <CardTitle className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-headline font-black text-white tracking-tighter uppercase">Reserve Grid</span>
                  </div>
                  <Tabs defaultValue="hourly" onValueChange={(v) => setBookingMode(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 rounded-2xl border border-white/5">
                      <TabsTrigger value="hourly" className="rounded-xl text-[10px] font-black uppercase tracking-widest py-2">Standard</TabsTrigger>
                      <TabsTrigger value="monthly" className="rounded-xl text-[10px] font-black uppercase tracking-widest py-2">Commute</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8 p-8">
                {isOwner && (
                  <div className="p-5 rounded-[1.25rem] bg-orange-500/10 border border-orange-500/20 flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-black text-white/90 leading-relaxed uppercase tracking-tight">Ownership Lock: Hosts are restricted from booking their own marketplace assets.</p>
                  </div>
                )}
                
                <div className="space-y-6">
                  <div className="p-6 rounded-[1.5rem] bg-white/5 border border-white/10 space-y-6 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Bike className="w-5 h-5" /></div>
                        <span className="text-sm font-black text-white uppercase tracking-tight">Bikes</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90" onClick={() => setBikeCount(Math.max(0, bikeCount - 1))}><Minus className="w-4 h-4" /></Button>
                        <span className="w-6 text-center text-xl text-white font-black tracking-tight">{bikeCount}</span>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90" onClick={() => setBikeCount(bikeCount + 1)}><Plus className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><Car className="w-5 h-5" /></div>
                        <span className="text-sm font-black text-white uppercase tracking-tight">Cars</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90" onClick={() => setCarCount(Math.max(0, carCount - 1))}><Minus className="w-4 h-4" /></Button>
                        <span className="w-6 text-center text-xl text-white font-black tracking-tight">{carCount}</span>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90" onClick={() => setCarCount(carCount + 1)}><Plus className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest ml-1">Arrival Date</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-black h-16 rounded-[1.25rem] bg-white/5 border-white/10 text-white hover:bg-white/10 transition-all",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-3 h-5 w-5 text-primary opacity-60" />
                          {selectedDate ? format(selectedDate, "PPP") : <span>Sync Date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 glass-morphism border-white/10 shadow-2xl rounded-[1.5rem] overflow-hidden" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={setSelectedDate}
                          initialFocus
                          className="bg-[#0b0a0f] text-white"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest ml-1">Arrival Window</p>
                    <div className="flex gap-3">
                      <Select value={selectedHour} onValueChange={setSelectedHour}>
                        <SelectTrigger className="flex-1 bg-white/5 border-white/10 h-16 text-white rounded-[1.25rem] font-black text-lg focus:ring-primary/50">
                          <Clock className="w-5 h-5 mr-2 text-primary opacity-60" />
                          <SelectValue placeholder="Hr" />
                        </SelectTrigger>
                        <SelectContent className="glass-morphism border-white/10 text-white max-h-60 rounded-xl">
                          {hoursOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="font-black">{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                        <SelectTrigger className="flex-1 bg-white/5 border-white/10 h-16 text-white rounded-[1.25rem] font-black text-lg focus:ring-primary/50">
                          <SelectValue placeholder="Min" />
                        </SelectTrigger>
                        <SelectContent className="glass-morphism border-white/10 text-white rounded-xl">
                          {minutesOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="font-black">{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {bookingMode === 'hourly' ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest ml-1">Park Duration</p>
                      <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger className="w-full bg-white/5 border-white/10 h-16 text-white rounded-[1.25rem] font-black text-lg focus:ring-primary/50">
                          <Timer className="w-5 h-5 mr-3 text-primary opacity-60" />
                          <SelectValue placeholder="Duration" />
                        </SelectTrigger>
                        <SelectContent className="glass-morphism border-white/10 text-white rounded-xl max-h-60">
                          {durationOptions.map((opt) => <SelectItem key={opt.value} value={opt.value} className="font-black">{opt.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="p-6 rounded-[1.5rem] bg-primary/5 border border-primary/20 flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300 shadow-lg">
                      <CalendarRange className="w-8 h-8 text-primary shadow-xl" strokeWidth={3} />
                      <p className="text-[10px] text-white/90 font-black uppercase tracking-[0.2em] leading-tight">30-Day Auto-Renewing Commute Lock</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4 mt-8 border-t border-white/5 pt-8">
                  {bookingMode === 'hourly' ? (
                    <div className="space-y-3">
                      {bikeCount > 0 && (
                        <div className="flex justify-between text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                          <span>Bikes (₹{BIKE_RATE} x {bikeCount} x {durationNum}hr)</span>
                          <span className="text-white">₹{BIKE_RATE * bikeCount * durationNum}</span>
                        </div>
                      )}
                      {carCount > 0 && (
                        <div className="flex justify-between text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                          <span>Cars (₹{CAR_RATE} x {carCount} x {durationNum}hr)</span>
                          <span className="text-white">₹{CAR_RATE * carCount * durationNum}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bikeCount > 0 && (
                        <div className="flex justify-between text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                          <span>Bike Monthly (₹{BIKE_MONTHLY} x {bikeCount})</span>
                          <span className="text-white">₹{BIKE_MONTHLY * bikeCount}</span>
                        </div>
                      )}
                      {carCount > 0 && (
                        <div className="flex justify-between text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                          <span>Car Monthly (₹{CAR_MONTHLY} x {carCount})</span>
                          <span className="text-white">₹{CAR_MONTHLY * carCount}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                    <span>Tambaram Service Fee</span>
                    <span className="text-white">₹{PLATFORM_FEE}</span>
                  </div>
                  <div className="flex justify-between items-center font-black pt-4 border-t border-white/10">
                    <span className="text-white uppercase tracking-widest text-xs">Total Estimated</span>
                    <span className="text-primary text-3xl tracking-tighter shadow-primary/20">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-8 pt-0">
                <Button 
                  className="w-full h-18 bg-primary text-primary-foreground text-xl font-black rounded-[1.25rem] shadow-[0_12px_40px_rgba(128,123,255,0.4)] active:scale-[0.98] transition-all group gap-3" 
                  onClick={handleBooking} 
                  disabled={isBooking || grandTotal === 0 || isOwner}
                >
                  {isBooking ? <Loader2 className="animate-spin w-7 h-7" /> : isOwner ? "Ownership Lock" : (
                    <>
                      Initialize Access
                      <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" strokeWidth={3} />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
