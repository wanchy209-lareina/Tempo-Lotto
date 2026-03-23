import { Loader2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Song } from './data/songs';

const SharpMinus = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const SharpPlus = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const SharpPlay = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className}>
    <polygon points="5,3 19,12 5,21"></polygon>
  </svg>
);

const SharpPause = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="6" y="4" width="4" height="16"></rect>
    <rect x="14" y="4" width="4" height="16"></rect>
  </svg>
);

const SharpChevronLeft = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const SharpChevronRight = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

export default function App() {
  const [targetBpm, setTargetBpm] = useState<number>(125);
  const [debouncedBpm, setDebouncedBpm] = useState<number>(125);
  const [selectedGenre, setSelectedGenre] = useState<string>('Random');
  const [activeSearchGenre, setActiveSearchGenre] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [availableSongs, setAvailableSongs] = useState<Song[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const genres = ['Random', 'Pop', 'K-Pop', 'Rock', 'Funk', 'City Pop', 'Folk', 'R&B', 'Jazz', 'Dance'];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Debounce BPM changes to avoid spamming the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBpm(targetBpm);
    }, 500);
    return () => clearTimeout(timer);
  }, [targetBpm]);

  // Fetch songs from iTunes API based on BPM and Genre
  useEffect(() => {
    let isMounted = true;
    
    const fetchSongs = async () => {
      setIsLoading(true);
      setAvailableSongs([]); // Clear immediately so UI reflects loading and audio stops
      setCurrentSongIndex(-1);

      try {
        let searchGenre = selectedGenre;
        if (selectedGenre === 'Random') {
          const actualGenres = genres.filter(g => g !== 'Random');
          searchGenre = actualGenres[Math.floor(Math.random() * actualGenres.length)];
        }

        if (isMounted) {
          setActiveSearchGenre(searchGenre);
        }

        // Search iTunes for tracks matching the specific BPM and Genre
        const genreTerm = `+${searchGenre.toLowerCase().replace(' ', '+')}`;
        const response = await fetch(`https://itunes.apple.com/search?term=${debouncedBpm}+bpm${genreTerm}&entity=song&limit=200`);
        const data = await response.json();
        
        if (!isMounted) return;

        let validResults = data.results.filter((t: any) => t.previewUrl);

        // Filter by genre strictly
        const targetGenreStr = searchGenre.toLowerCase();
        
        const genreMatches = validResults.filter((t: any) => {
          const title = (t.trackName || '').toLowerCase();
          const album = (t.collectionName || '').toLowerCase();
          const genre = (t.primaryGenreName || '').toLowerCase();
          
          let hasGenre = false;
          if (targetGenreStr === 'r&b') {
            hasGenre = title.includes('r&b') || album.includes('r&b') || genre.includes('r&b') || genre.includes('soul');
          } else if (targetGenreStr === 'city pop') {
            hasGenre = title.includes('city pop') || album.includes('city pop') || genre.includes('j-pop') || genre.includes('city');
          } else if (targetGenreStr === 'pop') {
            hasGenre = genre === 'pop' || genre === 'pop/rock' || title.includes(' pop ') || album.includes(' pop ');
          } else {
            hasGenre = title.includes(targetGenreStr) || album.includes(targetGenreStr) || genre.includes(targetGenreStr);
          }
          return hasGenre;
        });

        // Enforce genre match if we found any, to prevent completely unrelated songs
        if (genreMatches.length > 0) {
          validResults = genreMatches;
        }

        // Try to find EXACT matches for the BPM in title or album
        const exactMatches = validResults.filter((t: any) => {
          const title = (t.trackName || '').toLowerCase();
          const album = (t.collectionName || '').toLowerCase();
          const target = debouncedBpm.toString();
          // Check if the number appears as a distinct word
          const regex = new RegExp(`\\b${target}\\b`);
          return regex.test(title) || regex.test(album);
        });

        if (exactMatches.length > 0) {
          validResults = exactMatches;
        }

        const badKeywords = [
          'metronome', 'click track', 'click', 
          'beep', 'pure beat', 'metronomo'
        ];

        validResults = validResults.filter((t: any) => {
          const title = (t.trackName || '').toLowerCase();
          const artist = (t.artistName || '').toLowerCase();
          const isBad = badKeywords.some(kw => title.includes(kw) || artist.includes(kw));
          return !isBad;
        });

        const tracks: Song[] = validResults.map((t: any) => {
          // Clean up titles like "Song Name (120 BPM)" to look more like real songs
          let cleanTitle = t.trackName.replace(new RegExp(`\\(?\\[?${debouncedBpm}\\s*bpm\\]?\\)?`, 'gi'), '').trim();
          cleanTitle = cleanTitle.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/-\s*$/, '').trim();
          cleanTitle = cleanTitle || t.trackName;

          return {
            id: t.trackId.toString(),
            title: cleanTitle,
            artist: t.artistName,
            bpm: debouncedBpm,
            url: t.previewUrl
          };
        });
        
        setAvailableSongs(tracks);
        setCurrentSongIndex(tracks.length > 0 ? 0 : -1);
        if (tracks.length === 0) {
          setIsPlaying(false);
        }
      } catch (error) {
        console.error("Failed to fetch songs:", error);
        if (isMounted) {
          setAvailableSongs([]);
          setCurrentSongIndex(-1);
          setIsPlaying(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchSongs();

    return () => {
      isMounted = false;
    };
  }, [debouncedBpm, selectedGenre, refreshKey]);

  // Handle audio source and playback
  useEffect(() => {
    if (!audioRef.current) return;

    const currentSong = currentSongIndex >= 0 ? availableSongs[currentSongIndex] : null;

    if (currentSong) {
      if (audioRef.current.src !== currentSong.url) {
        audioRef.current.src = currentSong.url;
        audioRef.current.playbackRate = 1; // Ensure normal speed
        audioRef.current.load();
        
        // Auto-play the new song if the user has interacted
        if (hasInteracted) {
          audioRef.current.play()
            .then(() => setIsPlaying(true))
            .catch((err) => {
              console.error("Autoplay prevented or source error:", err);
              setIsPlaying(false);
            });
        }
      }
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [currentSongIndex, availableSongs, hasInteracted]);

  const handleBpmChange = (delta: number) => {
    setHasInteracted(true);
    setTargetBpm((prev) => {
      const next = prev + delta;
      return Math.min(Math.max(next, 40), 240);
    });
  };

  const togglePlayPause = () => {
    setHasInteracted(true);
    if (!audioRef.current || currentSongIndex < 0) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    }
  };

  const handleNext = () => {
    setHasInteracted(true);
    if (availableSongs.length <= 1) return;
    setCurrentSongIndex((prev) => (prev + 1) % availableSongs.length);
  };

  const handlePrev = () => {
    setHasInteracted(true);
    if (availableSongs.length <= 1) return;
    setCurrentSongIndex((prev) => (prev - 1 + availableSongs.length) % availableSongs.length);
  };

  const currentSong = currentSongIndex >= 0 ? availableSongs[currentSongIndex] : null;

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col items-center justify-center px-6 py-4 sm:px-12 sm:py-6 font-sans">
      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef} 
        loop 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="w-full max-w-[400px] flex flex-col gap-8 sm:gap-10 h-full max-h-[800px] justify-center">
        {/* Header */}
        <div className="text-left flex flex-col gap-1">
          <p className="text-[#8D67FC] text-[16px] font-normal leading-[1.32] tracking-[-0.32px]">Make practice groove</p>
          <h1 className="text-black text-[40px] font-bold leading-[1.32] tracking-[-0.80px]">Tempo Lotto</h1>
        </div>

        {/* BPM Controls */}
        <div className="flex flex-col items-center w-full gap-1">
          <div className="flex items-center justify-center gap-[27px] w-full h-[71px]">
            <button 
              onClick={() => handleBpmChange(-5)}
              className="w-[48px] h-[48px] bg-white flex-shrink-0 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
              aria-label="Decrease BPM"
            >
              <span className="text-black text-[24px] font-inter font-normal leading-[0.88]">-</span>
            </button>
            
            <div className="flex justify-center min-w-[80px]">
              <span className="text-black text-[60px] font-bold leading-[0.89] tabular-nums">
                {targetBpm}
              </span>
            </div>
            
            <button 
              onClick={() => handleBpmChange(5)}
              className="w-[48px] h-[48px] bg-white flex-shrink-0 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
              aria-label="Increase BPM"
            >
              <span className="text-black text-[24px] font-inter font-normal leading-[0.88]">+</span>
            </button>
          </div>
          <p className="text-[#666666] text-[14px] font-normal leading-[1.32] tracking-[-0.28px] uppercase">TAP +/-5 BPM</p>
        </div>

        {/* Genre Selector and Player Card Group */}
        <div className="w-full flex flex-col gap-[30px]">
          {/* Genre Selector */}
          <div className="w-full">
            <div className="w-full overflow-x-auto py-[2px] px-[2px] -mx-[2px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex gap-3 w-max pr-4">
                {genres.map(g => (
                  <button
                    key={g}
                    onClick={() => {
                      setSelectedGenre(g);
                      if (g === 'Random') {
                        setRefreshKey(prev => prev + 1);
                      }
                    }}
                    className={`px-3 py-2 text-[16px] font-bold leading-[1.32] border-2 border-black whitespace-nowrap transition-colors ${
                      selectedGenre === g 
                        ? 'bg-[#8258FF] text-white' 
                        : 'bg-white text-black hover:bg-gray-50'
                    }`}
                  >
                    {g.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Player Card */}
          <div className="w-full h-[127px] bg-white border-2 border-black p-[19px] flex justify-between items-center">
            {isLoading ? (
            <div className="flex-1 pr-4 min-w-0 flex items-center gap-3 h-full">
              <Loader2 className="w-6 h-6 animate-spin text-[#8258FF]" />
              <div className="flex flex-col justify-center">
                <h2 className="text-black text-[24px] font-bold leading-[1.32] tracking-[-0.48px] truncate">Searching...</h2>
                <p className="text-[#666666] text-[14px] font-normal leading-[1.32] tracking-[-0.28px] mt-1 truncate">Finding {debouncedBpm} BPM {activeSearchGenre}</p>
              </div>
            </div>
          ) : currentSong ? (
            <div className="flex-1 pr-4 min-w-0 h-full flex flex-col justify-between">
              <div>
                <h2 className="text-black text-[24px] font-bold leading-[1.32] tracking-[-0.48px] truncate">{currentSong.title}</h2>
                <p className="text-[#666666] text-[14px] font-normal leading-[1.32] tracking-[-0.28px] mt-1 truncate">{currentSong.artist}</p>
              </div>
              <div className="mt-2 inline-flex items-center justify-center bg-[#FFF0F8] rounded-[4px] px-3 py-1 w-max">
                <span className="text-[#FF2CAE] text-[12px] font-normal leading-[1.50] uppercase">
                  {currentSong.bpm} BPM
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 pr-4 min-w-0 h-full flex flex-col justify-center">
              <h2 className="text-black text-[24px] font-bold leading-[1.32] tracking-[-0.48px] truncate">No tracks</h2>
              <p className="text-[#666666] text-[14px] font-normal leading-[1.32] tracking-[-0.28px] mt-1 truncate">Try another BPM</p>
            </div>
          )}

          <button 
            onClick={togglePlayPause}
            disabled={!currentSong || isLoading}
            className="w-[64px] h-[64px] bg-[#A78BFA] flex-shrink-0 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <SharpPause className="w-6 h-6 text-black" />
            ) : (
              <SharpPlay className="w-6 h-6 text-black translate-x-0.5" />
            )}
          </button>
        </div>
        </div>

        {/* Switcher */}
        <div className="w-full flex flex-col gap-[12px]">
          <p className="text-[#666666] text-[14px] font-normal leading-[1.32] tracking-[-0.28px]">Switch songs at similar tempo</p>
          <div className="flex justify-between items-center w-full">
            <button 
              onClick={handlePrev}
              disabled={availableSongs.length <= 1 || isLoading}
              className="w-[94px] h-[48px] bg-white flex items-center justify-center gap-2 text-black text-[13px] font-semibold leading-[1.50] border-2 border-black rounded-[4px] disabled:opacity-50 active:bg-gray-50 transition-colors"
            >
              <SharpChevronLeft className="w-4 h-4" />
              PREV
            </button>
            
            <div className="w-[60px] h-[44px] bg-[#FFF5E1] border-2 border-black flex items-center justify-center text-black text-[16px] font-inter font-bold leading-[1.50]">
              {availableSongs.length > 0 && !isLoading ? `${currentSongIndex + 1}/${availableSongs.length}` : '0/0'}
            </div>
            
            <button 
              onClick={handleNext}
              disabled={availableSongs.length <= 1 || isLoading}
              className="w-[95px] h-[48px] bg-white flex items-center justify-center gap-2 text-black text-[13px] font-semibold leading-[1.50] border-2 border-black rounded-[4px] disabled:opacity-50 active:bg-gray-50 transition-colors"
            >
              NEXT
              <SharpChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
