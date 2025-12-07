import { useState, useEffect } from 'react';
import { Bookmark, Plus, Trash2, Play, ChevronUp, ChevronDown, Sparkles, Settings } from 'lucide-react';
import type { VideoData, Bookmark as BookmarkType } from './types';

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  const [currentVideo, setCurrentVideo] = useState<VideoData | null>(null);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set());
  const [loadingExplanation, setLoadingExplanation] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentVideo();
    loadApiKey();
  }, []);

  const loadCurrentVideo = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url?.includes('youtube.com/watch')) {
        setError('Please open a YouTube video');
        setIsLoading(false);
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_INFO' });
      if (response.error) {
        setError(response.error);
        setIsLoading(false);
        return;
      }

      const { videoId } = response;
      const stored = await chrome.storage.local.get([videoId]);

      if (stored[videoId]) {
        setCurrentVideo(stored[videoId] as VideoData);
      } else {
        setCurrentVideo({
          videoId: response.videoId,
          title: response.title,
          url: response.url,
          bookmarks: []
        });
      }
      setIsLoading(false);
    } catch {
      setError('Failed to load video info');
      setIsLoading(false);
    }
  };

  const addBookmark = async () => {
    if (!currentVideo) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    const info = await chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_INFO' });
    const newBookmark: BookmarkType = {
      id: Date.now().toString(),
      timestamp: info.currentTime,
      note: note.trim() || 'No note',
      createdAt: Date.now()
    };

    const updated = {
      ...currentVideo,
      bookmarks: [...currentVideo.bookmarks, newBookmark].sort((a, b) => a.timestamp - b.timestamp)
    };

    await chrome.storage.local.set({ [currentVideo.videoId]: updated });
    setCurrentVideo(updated);
    setNote('');
  };

  const deleteBookmark = async (id: string) => {
    if (!currentVideo) return;
    const updated = {
      ...currentVideo,
      bookmarks: currentVideo.bookmarks.filter(b => b.id !== id)
    };
    await chrome.storage.local.set({ [currentVideo.videoId]: updated });
    setCurrentVideo(updated);
  };

  const jumpToTimestamp = async (ts: number) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) chrome.tabs.sendMessage(tab.id, { action: 'JUMP_TO_TIME', timestamp: ts });
  };

  const loadApiKey = async () => {
    const { apiKey } = await chrome.storage.local.get(['apiKey']);
    if (apiKey) setApiKey(apiKey);
  };

  const saveApiKey = async () => {
    await chrome.storage.local.set({ apiKey: apiKey.trim() });
    setShowSettings(false);
  };

  const toggleExplanation = (id: string) => {
    setExpandedExplanations(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // GEMINI VERSION — WORKS DIRECTLY (NO PROXY!)
        const explainWithAI = async (bookmark: BookmarkType) => {
    if (!apiKey.trim()) {
      alert('Set your Google Gemini API key first!');
      setShowSettings(true);
      return;
    }
    if (!currentVideo) return;

    setLoadingExplanation(bookmark.id);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      await chrome.tabs.sendMessage(tab.id, { action: 'JUMP_TO_TIME', timestamp: bookmark.timestamp });
      await new Promise(r => setTimeout(r, 800));

      const res = await chrome.tabs.sendMessage(tab.id, { action: 'CAPTURE_SCREENSHOT' });
      if (res.error) throw new Error(res.error);

      const response = await fetch(
`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: `You are an expert programming tutor. 
Extract ALL visible code from the screenshot EXACTLY (preserve formatting and indentation).
Then explain it line-by-line in clear, beginner-friendly language.

Rules:
- Start directly with the code block (triple backticks with language if detectable).
- After the code block, give the line-by-line explanation.
- Do NOT add any intro, summary, or extra concepts.
- Use as many tokens as needed to finish the full explanation.`
                },
                { inline_data: { mime_type: 'image/png', data: res.screenshot } }
              ]
            }],
            generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,           // ← THIS IS THE KEY FIX
            topP: 0.95
          },
          })
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini failed');

      const explanation = data.candidates[0].content.parts[0].text;

      const updatedBookmarks = currentVideo.bookmarks.map(b =>
        b.id === bookmark.id ? { ...b, aiExplanation: explanation, screenshot: res.screenshot } : b
      );

      const updatedVideo = { ...currentVideo, bookmarks: updatedBookmarks };
      await chrome.storage.local.set({ [currentVideo.videoId]: updatedVideo });
      setCurrentVideo(updatedVideo);
      setExpandedExplanations(prev => new Set([...prev, bookmark.id]));

    } catch (err: any) {
      alert(`AI failed: ${err.message}`);
    } finally {
      setLoadingExplanation(null);
    }
  };

  if (isLoading) return <div className="w-96 h-[600px] flex items-center justify-center bg-gray-50 text-gray-600">Loading...</div>;
  if (error) return <div className="w-96 h-[600px] flex flex-col items-center justify-center bg-gray-50 text-center p-8"><Bookmark className="w-16 h-16 text-red-500 mb-4" /><p className="font-medium text-gray-800">{error}</p><p className="text-sm text-gray-600 mt-2">Open a YouTube video to start</p></div>;

  return (
    <div className="w-96 h-[600px] bg-white flex flex-col">
      {/* Header */}
      <div className="bg-red-600 text-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5" />
            <h1 className="font-bold text-lg">Video Bookmarks</h1>
          </div>
          <button onClick={() => setShowSettings(s => !s)} className="p-1 hover:bg-red-700 rounded">
            <Settings className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-red-100 truncate">{currentVideo?.title}</p>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="p-4 bg-amber-50 border-b text-sm">
          <h3 className="font-semibold mb-2">Gemini API Key (free)</h3>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full p-2 border rounded mb-2 text-xs"
          />
          <button onClick={saveApiKey} className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 text-sm">
            Save Key
          </button>
          <p className="text-xs text-gray-600 mt-3">
            Get free key →{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline text-blue-600">
              aistudio.google.com/app/apikey
            </a>
          </p>
        </div>
      )}

      {/* Add Bookmark */}
      <div className="p-4 border-b bg-gray-50">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add a note..."
          className="w-full p-2 border rounded resize-none text-sm focus:ring-2 focus:ring-red-500 outline-none"
          rows={2}
        />
        <button
          onClick={addBookmark}
          className="mt-2 w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 flex items-center justify-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" /> Add Bookmark
        </button>
      </div>

      {/* Bookmarks */}
      <div className="flex-1 overflow-y-auto">
        {(!currentVideo || currentVideo.bookmarks.length === 0) ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 p-6 text-center">
            <Bookmark className="w-12 h-12 mb-3 opacity-30" />
            <p>No bookmarks yet</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {currentVideo.bookmarks.map(bm => (
              <div key={bm.id} className="border rounded-lg p-3 bg-white hover:shadow-md transition">
                <div className="flex justify-between gap-3">
                  <div className="flex-1">
                    <button
                      onClick={() => jumpToTimestamp(bm.timestamp)}
                      className="text-red-600 hover:text-red-700 font-mono text-sm font-bold flex items-center gap-1 mb-1"
                    >
                      <Play className="w-3 h-3" /> {formatTime(bm.timestamp)}
                    </button>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{bm.note}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(bm.createdAt).toLocaleString()}</p>

                    {bm.aiExplanation && (
                      <div className="mt-3 border-t pt-3">
                        <button
                          onClick={() => toggleExplanation(bm.id)}
                          className="flex items-center gap-2 text-purple-600 hover:text-purple-700 text-sm font-medium mb-2"
                        >
                          <Sparkles className="w-4 h-4" /> AI Explanation
                          {expandedExplanations.has(bm.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {expandedExplanations.has(bm.id) && (
                          <div className="bg-purple-50 p-3 rounded text-sm text-gray-700 whitespace-pre-wrap">
                            {bm.aiExplanation}
                          </div>
                        )}
                      </div>
                    )}

                    {!bm.aiExplanation && (
                      <button
                        onClick={() => explainWithAI(bm)}
                        disabled={loadingExplanation === bm.id}
                        className="mt-3 flex items-center gap-2 text-purple-600 hover:text-purple-700 text-sm disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        {loadingExplanation === bm.id ? 'Analyzing...' : 'Explain with AI'}
                      </button>
                    )}
                  </div>
                  <button onClick={() => deleteBookmark(bm.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t p-3 bg-gray-50 text-center text-xs text-gray-500">
        {currentVideo?.bookmarks.length || 0} bookmark{currentVideo?.bookmarks.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

export default App;

//old clunky version