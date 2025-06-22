import ThreadedChat from "../components/ThreadedChat";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      {/* Thin Header */}
      <header className="w-full bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 px-6 py-3">
        <h1 className="text-xl font-bold text-white">AI Chat with Contextual Threading</h1>
      </header>
      
      {/* Main Content */}
      <div className="h-[calc(100vh-60px)]"> {/* Subtract header height */}
        <ThreadedChat />
      </div>
    </div>
  );
}
