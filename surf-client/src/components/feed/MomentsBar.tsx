import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface Moment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  hasViewed: boolean;
  timestamp: Date;
}

export default function MomentsBar() {
  const { user } = useAuthStore();
  
  // Mock data - replace with API call later
  const [moments] = useState<Moment[]>([
    // Empty by default - will be populated from API
  ]);

  return (
    <div className="mb-4">
      {/* Horizontal scrollable container - Surf's rich horizontal card design */}
      <div className="relative bg-gradient-to-r from-cyan-50/80 via-blue-50/80 to-purple-50/80 dark:from-slate-800/50 dark:via-slate-800/50 dark:to-slate-800/50 rounded-2xl p-4 border border-cyan-200/50 dark:border-slate-700/50">
        
        {/* Animated wave accent at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-t-2xl">
          <div className="h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
        </div>
        
        <div className="flex gap-4 overflow-x-auto scrollbar-hide">
          
          {/* Create Moment Button - Surf's rich card with multiple layers */}
          <div className="flex-shrink-0 group cursor-pointer">
            <div className="relative w-[140px] h-[200px] rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 p-[3px] shadow-xl shadow-cyan-500/30 group-hover:shadow-2xl group-hover:shadow-cyan-500/50 transition-all duration-500">
              {/* Inner container */}
              <div className="relative w-full h-full rounded-[14px] overflow-hidden bg-white dark:bg-slate-800">
                
                {/* User avatar background with overlay */}
                {user?.photoURL ? (
                  <div className="absolute inset-0">
                    <img 
                      src={user.photoURL} 
                      alt="You"
                      className="w-full h-full object-cover brightness-90 group-hover:scale-110 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/40 via-blue-500/40 to-purple-500/40 mix-blend-multiply"></div>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-100 via-blue-100 to-purple-100 dark:from-slate-700 dark:via-slate-600 dark:to-slate-700">
                    {/* Multiple wave layers for depth */}
                    <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <path d="M0,40 Q25,25 50,40 T100,40 L100,100 L0,100 Z" fill="url(#waveGradient)" />
                      <path d="M0,60 Q25,45 50,60 T100,60 L100,100 L0,100 Z" fill="url(#waveGradient)" opacity="0.5" />
                    </svg>
                    
                    {/* User initials with ocean styling */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative">
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-cyan-400 dark:bg-cyan-500 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                        
                        {/* Initials container with gradient background */}
                        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 dark:from-cyan-600 dark:to-blue-700 flex items-center justify-center shadow-2xl border-4 border-white/30 dark:border-white/20">
                          <span className="text-4xl font-bold text-white drop-shadow-lg tracking-wide">
                            {(() => {
                              const name = user?.displayName || user?.email || 'S';
                              const words = name.split(' ');
                              if (words.length >= 2) {
                                return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                              }
                              return name.substring(0, 2).toUpperCase();
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Decorative elements */}
                    <div className="absolute top-4 left-4 w-6 h-6 rounded-full bg-cyan-400/30 dark:bg-cyan-500/20 animate-bounce" style={{ animationDelay: '0s' }}></div>
                    <div className="absolute top-8 right-6 w-4 h-4 rounded-full bg-blue-400/30 dark:bg-blue-500/20 animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                    <div className="absolute bottom-24 left-8 w-5 h-5 rounded-full bg-purple-400/30 dark:bg-purple-500/20 animate-bounce" style={{ animationDelay: '0.6s' }}></div>
                  </div>
                )}
                
                {/* Animated wave pattern overlay */}
                <div className="absolute inset-0 opacity-20">
                  <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(6, 182, 212, 0.8)" />
                        <stop offset="100%" stopColor="rgba(147, 51, 234, 0.8)" />
                      </linearGradient>
                    </defs>
                    <path d="M0,50 Q25,30 50,50 T100,50 L100,100 L0,100 Z" fill="url(#waveGradient)" className="animate-pulse" />
                  </svg>
                </div>
                
                {/* Dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                
                {/* Wave SVG decoration at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-20 opacity-40">
                  <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" className="fill-white/50" />
                  </svg>
                </div>
                
                {/* Plus button with wave decoration */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                  <div className="relative">
                    {/* Ripple effect */}
                    <div className="absolute inset-0 rounded-2xl bg-white/40 animate-ping"></div>
                    <div className="relative w-12 h-12 rounded-2xl bg-white dark:bg-slate-100 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-all duration-300">
                      <svg className="w-7 h-7 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* "Tạo Moment" text with icon */}
                <div className="absolute bottom-20 left-0 right-0 px-3 text-center z-10">
                  <div className="inline-flex items-center gap-1.5 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
                    <span className="text-lg">🌊</span>
                    <span className="text-sm font-bold text-white drop-shadow-lg">Tạo Moment</span>
                  </div>
                </div>
                
                {/* Decorative corner accent */}
                <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-gradient-to-br from-white/40 to-white/10 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Friend Moments - Surf's rich horizontal cards */}
          {moments.length > 0 && moments.map((moment) => (
            <div 
              key={moment.id}
              className="flex-shrink-0 group cursor-pointer"
            >
              <div className="relative w-[140px] h-[200px] rounded-2xl overflow-hidden transition-all duration-500">
                {/* Animated gradient border */}
                <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
                  moment.hasViewed
                    ? 'bg-gradient-to-br from-gray-300 to-gray-400 dark:from-slate-600 dark:to-slate-700'
                    : 'bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-500 shadow-xl shadow-cyan-500/30 group-hover:shadow-2xl group-hover:shadow-cyan-500/50'
                }`}>
                  {!moment.hasViewed && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-white/20 animate-pulse"></div>
                  )}
                </div>
                
                {/* Inner content */}
                <div className="absolute inset-[3px] rounded-[14px] overflow-hidden bg-white dark:bg-slate-800">
                  {/* Main image */}
                  <img 
                    src={moment.userAvatar || 'https://via.placeholder.com/140x200'} 
                    alt={moment.userName}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                  
                  {/* Gradient overlays for depth */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10"></div>
                  
                  {/* User name with background */}
                  <div className="absolute bottom-3 left-3 right-3 z-10">
                    <div className="bg-black/40 backdrop-blur-sm rounded-xl px-2.5 py-1.5 border border-white/20">
                      <span className="text-sm font-semibold text-white drop-shadow-md line-clamp-2 leading-tight">
                        {moment.userName}
                      </span>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="w-1 h-1 rounded-full bg-cyan-400"></div>
                        <span className="text-[10px] text-gray-300">2 giờ trước</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* "NEW" badge for unviewed moments */}
                  {!moment.hasViewed && (
                    <div className="absolute top-3 left-3 z-10">
                      <div className="relative">
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-md opacity-70"></div>
                        <div className="relative flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full px-2.5 py-1 shadow-lg border border-white/30">
                          <svg className="w-3 h-3 text-white animate-pulse" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="12" r="8" />
                          </svg>
                          <span className="text-[10px] font-bold text-white tracking-wide">MỚI</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* View count badge */}
                  <div className="absolute top-3 right-3 z-10">
                    <div className="bg-black/40 backdrop-blur-sm rounded-full px-2 py-1 border border-white/20">
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        <span className="text-[10px] font-medium text-white">124</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Wave decoration at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 opacity-20 pointer-events-none">
                    <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
                      <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" className="fill-cyan-400" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* See all button - Rich design */}
          {moments.length > 5 && (
            <div className="flex-shrink-0 group cursor-pointer">
              <div className="relative w-[140px] h-[200px] rounded-2xl border-[3px] border-dashed border-cyan-300 dark:border-slate-600 bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50 dark:from-slate-800 dark:to-slate-800/50 group-hover:border-cyan-500 dark:group-hover:border-cyan-500 group-hover:from-cyan-100 dark:group-hover:from-slate-700 transition-all duration-500 overflow-hidden">
                
                {/* Background wave pattern */}
                <div className="absolute inset-0 opacity-10">
                  <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M0,50 Q25,30 50,50 T100,50 L100,100 L0,100 Z" fill="currentColor" className="text-cyan-500" />
                  </svg>
                </div>
                
                {/* Content */}
                <div className="relative h-full flex flex-col items-center justify-center gap-3 p-4">
                  {/* Wave icon with glow */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-cyan-400 rounded-full blur-xl opacity-50 animate-pulse"></div>
                    <div className="relative text-5xl">🌊</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-base font-bold text-gray-700 dark:text-gray-300 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors mb-1">
                      Xem tất cả
                    </div>
                    <div className="inline-flex items-center gap-1 bg-cyan-100 dark:bg-slate-700 rounded-full px-3 py-1">
                      <svg className="w-3 h-3 text-cyan-600 dark:text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">{moments.length} moments</span>
                    </div>
                  </div>
                  
                  {/* Arrow icon */}
                  <div className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-cyan-500 dark:bg-cyan-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
        
        {/* Bottom wave decoration */}
        <div className="absolute bottom-0 left-0 right-0 h-8 opacity-[0.06] dark:opacity-[0.03] pointer-events-none overflow-hidden rounded-b-2xl">
          <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" className="fill-cyan-500" />
          </svg>
        </div>
      </div>
    </div>
  );
}
