
export type ParkingStatus = 'available' | 'occupied' | 'pending';

export interface ParkingSpot {
  id: string;
  ownerId: string;
  ownerName?: string;
  name: string;
  address: string;
  phone: string;
  pricePerHour: number;
  bikePricePerHour?: number;
  carPricePerHour?: number;
  bikeMonthlyRate?: number;
  carMonthlyRate?: number;
  imageUrls: string[];
  status: ParkingStatus;
  description: string;
  lat: number;
  lng: number;
  verified: boolean;
  createdAt?: any;
}

export interface Booking {
  id: string;
  spotId: string;
  userId: string;
  hostId: string;
  startTime: string;
  endTime?: string;
  status: 'pending' | 'active' | 'awaiting-payment' | 'completed' | 'cancelled';
  totalAmount?: number;
  bikeCount: number;
  carCount: number;
  isSubscription?: boolean;
  otp?: string;
  otpExpiresAt?: string;
  createdAt?: string;
  paymentId?: string;
  hasReview?: boolean;
}

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  spotId: string;
  rating: number;
  comment: string;
  createdAt: string;
}
