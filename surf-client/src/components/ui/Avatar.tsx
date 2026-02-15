import { useMemo } from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  showOnlineIndicator?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-20 h-20 text-2xl'
};

export default function Avatar({ 
  src, 
  name, 
  size = 'md', 
  className = '',
  showOnlineIndicator = false 
}: AvatarProps) {
  const initials = useMemo(() => {
    if (!name) return 'S';
    
    const cleanName = name.trim();
    const words = cleanName.split(/\s+/);
    
    if (words.length >= 2) {
      // Lấy chữ cái đầu của từ đầu và từ cuối
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    
    // Nếu chỉ có 1 từ, lấy 1 chữ cái đầu
    return cleanName.substring(0, 1).toUpperCase();
  }, [name]);

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {src ? (
        <img 
          src={src} 
          alt={name || ''} 
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 dark:from-cyan-600 dark:to-blue-700 flex items-center justify-center">
          <span className="font-bold text-white drop-shadow-md">
            {initials}
          </span>
        </div>
      )}
      
      {/* Online indicator */}
      {showOnlineIndicator && (
        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-slate-800 rounded-full"></div>
      )}
    </div>
  );
}
