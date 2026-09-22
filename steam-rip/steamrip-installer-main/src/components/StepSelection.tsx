import { GameInfo } from "../types";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  onNext: (info: GameInfo) => void;
}

export const StepSelection = ({ onNext }: Props) => {
  const handleSelect = async () => {
    try {
      const result = await window.api.selectDirectory();
      if (result) {
        onNext(result);
      }
    } catch (e) {
      console.error(e);
      // alert("Failed to select directory"); // Better to show error in UI, but alert ok for now
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-8 animate-in fade-in zoom-in duration-500">
      <CardHeader className="text-center space-y-2 p-0">
        <CardTitle className="text-3xl font-bold tracking-tight">
          Select Game Folder
        </CardTitle>
        <CardDescription className="text-lg">
          Choose the folder containing your downloaded SteamRIP game
        </CardDescription>
      </CardHeader>

      <Button
        onClick={handleSelect}
        size="lg"
        className="h-24 px-12 text-xl gap-4 bg-blue-600 hover:bg-blue-500 transition-all hover:scale-105 shadow-xl shadow-blue-900/20"
      >
        <FolderOpen className="w-8 h-8" />
        Browse Folder
      </Button>

      <div className="max-w-md text-sm text-zinc-500 text-center bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
        <span className="font-semibold text-zinc-400">Tip:</span> Ensure the
        folder contains the game executable and standard subfolders like{" "}
        <code>_CommonRedist</code>.
      </div>
    </div>
  );
};
