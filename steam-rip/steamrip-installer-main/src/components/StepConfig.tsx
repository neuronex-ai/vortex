import { useState, useEffect } from "react";
import { GameInfo, Runner } from "../types";
import {
  Play,
  Settings,
  FileText,
  ChevronRight,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StepConfigProps {
  gameInfo: GameInfo;
  onNext: (runner: Runner, addToHeroic: boolean, exe: string) => void;
}

export const StepConfig = ({ gameInfo, onNext }: StepConfigProps) => {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [loadingRunners, setLoadingRunners] = useState(true);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string>("");
  const [addToHeroic, setAddToHeroic] = useState(true);
  const [selectedExecutable, setSelectedExecutable] = useState<string>(
    gameInfo.executables[0] || "",
  );

  useEffect(() => {
    const fetchRunners = async () => {
      try {
        const foundRunners = await window.api.getRunners();
        setRunners(foundRunners);
        if (foundRunners.length > 0) {
          // Prefer proton-ge or newest proton
          setSelectedRunnerId(foundRunners[0].path);
        }
      } catch (error) {
        console.error("Failed to fetch runners", error);
      } finally {
        setLoadingRunners(false);
      }
    };
    fetchRunners();
  }, []);

  const handleNext = () => {
    const runner = runners.find((r) => r.path === selectedRunnerId);
    if (runner) {
      onNext(runner, addToHeroic, selectedExecutable);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-8 duration-500">
      <CardHeader className="text-center px-0">
        <CardTitle className="text-2xl">Configuration</CardTitle>
        <CardDescription>
          Setup compatibility tools and library options
        </CardDescription>
      </CardHeader>

      <ScrollArea className="flex-1 pr-4 -mr-4">
        <div className="space-y-8 py-4">
          {/* Executable Selection */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-base">
              <Play size={16} className="text-blue-400" /> Game Executable
            </Label>
            <Select
              value={selectedExecutable}
              onValueChange={setSelectedExecutable}
            >
              <SelectTrigger className="w-full bg-zinc-900/50 border-zinc-700">
                <SelectValue placeholder="Select Executable" />
              </SelectTrigger>
              <SelectContent>
                {gameInfo.executables.map((exe) => (
                  <SelectItem key={exe} value={exe}>
                    {exe}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Runner Selection */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-base">
              <Settings size={16} className="text-purple-400" /> Compatibility
              Tool
            </Label>

            {loadingRunners ? (
              <div className="flex items-center gap-2 text-zinc-400 p-3 bg-zinc-900/50 rounded border border-zinc-800">
                <Loader2 className="animate-spin" size={16} /> Loading
                runners...
              </div>
            ) : (
              <Select
                value={selectedRunnerId}
                onValueChange={setSelectedRunnerId}
              >
                <SelectTrigger className="w-full bg-zinc-900/50 border-zinc-700">
                  <SelectValue placeholder="Select Proton/Wine Runner" />
                </SelectTrigger>
                <SelectContent>
                  {runners.map((r) => (
                    <SelectItem key={r.path} value={r.path}>
                      {r.name}
                    </SelectItem>
                  ))}
                  {runners.length === 0 && (
                    <div className="p-2 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} /> No runners found.
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}

            {runners.length === 0 && !loadingRunners && (
              <p className="text-sm text-red-400 flex items-center gap-2">
                <AlertCircle size={14} /> Please install Wine or Proton via
                Heroic/Steam first.
              </p>
            )}
          </div>

          {/* Heroic Option */}
          <div className="flex items-center space-x-4 bg-zinc-900/30 p-4 rounded-lg border border-zinc-800 hover:border-purple-500/30 transition-colors">
            <Checkbox
              id="heroicCheck"
              checked={addToHeroic}
              onCheckedChange={(c) => setAddToHeroic(c === true)}
              className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="heroicCheck"
                className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Add to Heroic Games Launcher
              </Label>
              <p className="text-xs text-zinc-400">
                Automatically create a sideload entry in your specific library.
              </p>
            </div>
          </div>

          {/* Readme Section */}
          {gameInfo.readme && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-base">
                <FileText size={16} className="text-zinc-400" /> Instructions
              </Label>
              <ScrollArea className="h-48 w-full rounded-md border border-zinc-800 bg-black/20 p-4">
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap font-sans">
                  {gameInfo.readme}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="pt-6 border-t border-zinc-800 flex justify-end">
        <Button
          onClick={handleNext}
          disabled={!selectedRunnerId || loadingRunners}
          className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-purple-900/20"
        >
          Install Game <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
