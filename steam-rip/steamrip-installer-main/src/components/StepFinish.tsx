import { CheckCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Props {
  Path: string;
}

export const StepFinish = ({ Path }: Props) => {
  const handleOpenHeroic = async () => {
    try {
      await window.api.openHeroic();
    } catch (e) {
      console.error(e);
      alert("Failed to open Heroic");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="relative">
        <CheckCircle className="w-24 h-24 text-green-500 animate-bounce" />
        <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full animate-pulse" />
      </div>

      <CardHeader className="text-center p-0 space-y-2">
        <CardTitle className="text-3xl font-bold text-green-400">
          Installation Successful!
        </CardTitle>
        <CardDescription className="text-lg text-zinc-300">
          Game installed to{" "}
          <code className="bg-zinc-800 px-2 py-1 rounded text-white font-mono text-sm">
            {Path}
          </code>
        </CardDescription>
      </CardHeader>

      <div className="pt-4">
        <Button
          onClick={handleOpenHeroic}
          size="lg"
          className="bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-900/20 text-lg px-8 py-6 h-auto gap-3"
        >
          <ExternalLink className="w-6 h-6" />
          Open Heroic Games Launcher
        </Button>
      </div>
    </div>
  );
};
