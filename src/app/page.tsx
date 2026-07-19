'use client';

import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, ShieldCheck, Zap, ArrowRight, UserCircle, LogOut, Car } from "lucide-react";
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function LandingPage() {
  const { user } = useUser();
  const auth = useAuth();
  const heroImage = PlaceHolderImages.find(img => img.id === 'hero-bg') || PlaceHolderImages[0];

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <nav className="fixed top-0 w-full z-50 glass-morphism h-16 flex items-center justify-between px-6 md:px-12 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Car className="text-primary-foreground w-6 h-6" />
            </div>
            <span className="font-headline text-xl font-bold tracking-tight text-white">ParkShare</span>
          </Link>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
          <Link href="/explore" className="hover:text-primary transition-colors">Find Parking</Link>
          <Link href="/host" className="hover:text-primary transition-colors">List Your Spot</Link>
          <Link href="/dashboard" className="hover:text-primary transition-colors">My Bookings</Link>
        </div>
        <div className="flex items-center gap-4">
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
                <DropdownMenuItem asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/host">Hosting Hub</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive hover:bg-destructive/10 transition-colors">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" className="hidden md:flex text-white hover:bg-white/5" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6 rounded-xl" asChild>
                <Link href="/login">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </nav>

      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <div className="absolute inset-0 z-0">
          <Image 
            src={heroImage.imageUrl} 
            alt="Hero background" 
            fill 
            className="object-cover opacity-20 scale-105"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        </div>
        
        <div className="container relative z-10 px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest mb-8 animate-pulse">
            <Zap className="w-3 h-3" /> AI-VERIFIED PARKING SPOTS
          </div>
          <h1 className="text-5xl md:text-8xl font-headline font-black mb-8 max-w-5xl mx-auto leading-[1.1] text-white tracking-tighter">
            Smart Urban <span className="text-primary">Parking</span> Solved.
          </h1>
          <p className="text-muted-foreground text-lg md:text-2xl max-w-3xl mx-auto mb-12 font-medium leading-relaxed">
            Discover, book, and verify premium parking spaces in Tambaram instantly. Share your unused driveway and earn while simplifying city life.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link href="/explore">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg font-black px-12 h-16 rounded-2xl shadow-2xl shadow-primary/20 transition-all active:scale-95">
                Find Parking <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/host">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/5 text-lg font-bold px-12 h-16 rounded-2xl transition-all active:scale-95">
                Become a Host
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-32 bg-card/30 border-y border-white/5">
        <div className="container px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <FeatureCard 
              icon={<MapPin className="text-primary w-10 h-10" />}
              title="Real-time Discovery"
              description="High-fidelity interactive map interface to find available spots exactly where you need them with precise radius filtering."
            />
            <FeatureCard 
              icon={<ShieldCheck className="text-primary w-10 h-10" />}
              title="SpotInsight AI"
              description="Our specialized GenAI analyzes every listing photo to ensure accessibility, safety, and authenticity for your vehicle."
            />
            <FeatureCard 
              icon={<Zap className="text-primary w-10 h-10" />}
              title="Secure Checkout"
              description="Automated billing and unified payment gateway simulation for a seamless, professional parking experience."
            />
          </div>
        </div>
      </section>

      <footer className="py-16 border-t border-white/5 bg-background">
        <div className="container px-6 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg">
              <Car className="text-primary-foreground w-5 h-5" />
            </div>
            <span className="font-headline font-bold text-xl text-white">ParkShare</span>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">© 2024 ParkShare Tambaram • Smart Mobility Labs</p>
          <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Link href="#" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-primary transition-colors">Terms</Link>
            <Link href="#" className="hover:text-primary transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="bg-white/5 border-white/5 hover:border-primary/40 transition-all duration-500 rounded-[2.5rem] overflow-hidden group">
      <CardContent className="pt-10 pb-10 px-8">
        <div className="mb-8 p-4 rounded-2xl bg-primary/10 inline-block group-hover:scale-110 transition-transform duration-500">{icon}</div>
        <h3 className="text-2xl font-headline font-bold mb-4 text-white">{title}</h3>
        <p className="text-muted-foreground leading-relaxed text-sm font-medium">{description}</p>
      </CardContent>
    </Card>
  );
}
