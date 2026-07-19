
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, User, ShieldCheck, ArrowLeft, Car } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot-password'>('login');

  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: "Welcome back!", description: "Successfully signed in." });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign In Error",
        description: error.message || "Invalid email or password.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Email required", description: "Please enter your email to reset password.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ 
        title: "Reset Link Sent", 
        description: "Check your inbox for instructions to reset your password." 
      });
      setAuthMode('login');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Could not send reset email.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) {
      toast({ title: "Missing details", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }
      toast({ 
        title: "Account Created!", 
        description: "Welcome to ParkShare." 
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration Error",
        description: error.message || "Could not create account.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast({ title: "Welcome!", description: "Successfully signed in with Google." });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign In Error",
        description: "Failed to sign in with Google. Ensure this domain is authorized in Firebase Console.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(128,123,255,0.3)]">
          <Car className="text-primary-foreground w-6 h-6" />
        </div>
        <span className="font-headline text-2xl font-bold tracking-tight text-white">ParkShare</span>
      </Link>

      <Card className="w-full max-w-md glass-morphism border-white/10 overflow-hidden rounded-3xl">
        {authMode === 'forgot-password' ? (
          <div className="animate-in fade-in zoom-in duration-300">
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-white flex items-center gap-2">
                <ArrowLeft className="w-5 h-5 cursor-pointer text-muted-foreground hover:text-white" onClick={() => setAuthMode('login')} />
                Reset Password
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Enter your email and we'll send you a recovery link.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleForgotPassword}>
              <CardContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
                    <Input 
                      id="forgot-email" 
                      type="email" 
                      placeholder="name@example.com" 
                      className="pl-10 h-12 bg-white/5 border-white/10 text-white rounded-xl"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Send Reset Link"}
                </Button>
                <Button variant="ghost" type="button" className="text-xs text-muted-foreground" onClick={() => setAuthMode('login')}>
                  Back to Login
                </Button>
              </CardFooter>
            </form>
          </div>
        ) : (
          <Tabs value={authMode} onValueChange={(val) => setAuthMode(val as any)} className="w-full">
            <CardHeader className="pb-2">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-white/5 p-1 rounded-2xl border border-white/5">
                <TabsTrigger value="login" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Login</TabsTrigger>
                <TabsTrigger value="register" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Register</TabsTrigger>
              </TabsList>
              <CardTitle className="text-2xl font-headline text-white">
                Secure Parking Starts Here
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Access premium spots in Tambaram, Chennai.
              </CardDescription>
            </CardHeader>

            <TabsContent value="login" className="mt-0">
              <form onSubmit={handleEmailSignIn}>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="name@example.com" 
                        className="pl-10 h-12 bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/50"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="password" title="Enter your password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password</Label>
                      <Button variant="link" type="button" className="p-0 h-auto text-[10px] text-primary" onClick={() => setAuthMode('forgot-password')}>
                        Forgot Password?
                      </Button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
                      <Input 
                        id="password" 
                        type="password" 
                        className="pl-10 h-12 bg-white/5 border-white/10 text-white rounded-xl focus:ring-primary/50"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Sign In"}
                  </Button>
                  <div className="relative w-full py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-white/5" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                      <span className="bg-[#0b0a0f] px-4 text-muted-foreground">Quick Access</span>
                    </div>
                  </div>
                  <Button variant="outline" type="button" className="w-full h-12 rounded-xl border-white/10 text-white hover:bg-white/5" onClick={handleGoogleSignIn} disabled={loading}>
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
                    Continue with Google
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-0">
              <form onSubmit={handleEmailSignUp}>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Display Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
                      <Input 
                        id="reg-name" 
                        placeholder="John Doe" 
                        className="pl-10 h-12 bg-white/5 border-white/10 text-white rounded-xl"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
                      <Input 
                        id="reg-email" 
                        type="email" 
                        placeholder="name@example.com" 
                        className="pl-10 h-12 bg-white/5 border-white/10 text-white rounded-xl"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password" title="Set a secure password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60" />
                      <Input 
                        id="reg-password" 
                        type="password" 
                        className="pl-10 h-12 bg-white/5 border-white/10 text-white rounded-xl"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required 
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Create Account"}
                  </Button>
                  <div className="relative w-full py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-white/5" />
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                      <span className="bg-[#0b0a0f] px-4 text-muted-foreground">Or sign up with</span>
                    </div>
                  </div>
                  <Button variant="outline" type="button" className="w-full h-12 rounded-xl border-white/10 text-white hover:bg-white/5" onClick={handleGoogleSignIn} disabled={loading}>
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path></svg>
                    Google Account
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-2 mt-2">
                    <ShieldCheck className="w-3 h-3" /> Encrypted identity protection
                  </p>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </Card>
      
      <p className="mt-8 text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-50">
        ParkShare • Smart Parking in Tambaram
      </p>
    </div>
  );
}
