import { useEffect, useRef, useState } from "react";
import { InstallGameFailure, InstallProgress, Runner } from "../types";
import { Terminal, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StepInstallProps {
  gamePath: string;
  gameName: string;
  executable: string;
  runner: Runner;
  addToHeroicProp: boolean;
  onNext: (installedPath: string) => void;
}

export const StepInstall = ({
  gamePath,
  gameName,
  executable,
  runner,
  addToHeroicProp,
  onNext,
}: StepInstallProps) => {
  const [progress, setProgress] = useState<InstallProgress>({
    stage: "moving",
    message: "Starting...",
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<InstallGameFailure["error"] | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const destPathRef = useRef<string>("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    const cleanupProgress = window.api.onInstallProgress((p) => {
      setProgress(p);
    });

    const cleanupLogs = window.api.onInstallLog((log) => {
      setLogs((prev) => [...prev, log]);
    });

    window.api
      .installGame({
        sourcePath: gamePath,
        gameName,
        executable,
        runner,
        addToHeroicLib: addToHeroicProp,
      })
      .then((res) => {
        if (res.success) {
          destPathRef.current = res.path;
          setTimeout(() => {
            onNext(res.path);
          }, 1500);
          return;
        }

        if (res.error.destinationPath) {
          destPathRef.current = res.error.destinationPath;
        }
        setLogs((prev) => [...prev, `[CRITICAL ERROR] ${res.error.message}`]);
        setError(res.error);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setLogs((prev) => [...prev, `[CRITICAL ERROR] ${message}`]);
        setError({
          code: "INSTALL_FAILED",
          message,
        });
      });

    return () => {
      cleanupProgress();
      cleanupLogs();
    };
  }, [
    gamePath,
    gameName,
    executable,
    runner,
    addToHeroicProp,
    onNext,
  ]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const canContinue = destPathRef.current.length > 0;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-2">
          <XCircle size={40} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-red-500">
            Installation Failed
          </h2>
          <p className="text-zinc-400 mt-2">
            {error.code === "DESTINATION_EXISTS"
              ? "A game folder with this name already exists."
              : "The installer could not finish all steps."}
          </p>
        </div>

        <div className="max-w-md w-full bg-red-500/10 p-4 rounded-lg border border-red-500/20 text-sm font-mono text-red-200 break-all">
          {error.message}
        </div>

        <Button
          variant="secondary"
          onClick={() => destPathRef.current && onNext(destPathRef.current)}
          disabled={!canContinue}
          className="mt-4"
        >
          <AlertTriangle className="mr-2 h-4 w-4" />
          {error.code === "DESTINATION_EXISTS"
            ? "Use Existing Folder"
            : "Continue Anyway (Not Recommended)"}
        </Button>
      </div>
    );
  }

  // Calculate progress percentage (mock estimation based on stage)
  const getProgressValue = () => {
    switch (progress.stage) {
      case "moving":
        return 30;
      case "configuring":
        return 60;
      case "redist":
        return 80;
      case "heroic":
        return 90;
      case "done":
        return 100;
      default:
        return 10;
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          Installing {gameName}
        </CardTitle>
      </CardHeader>

      <div className="flex-1 flex flex-col justify-center space-y-8 px-8">
        {/* Progress Indicator */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <Badge
              variant="outline"
              className="text-xs uppercase tracking-wider text-zinc-400 border-zinc-700"
            >
              {progress.stage === "done" ? "Completed" : progress.stage}
            </Badge>
            <span className="text-sm font-medium text-zinc-500">
              {getProgressValue()}%
            </span>
          </div>
          <Progress value={getProgressValue()} className="h-3" />
          <p className="text-center text-zinc-300 font-medium animate-pulse">
            {progress.message}
          </p>
        </div>

        {/* Logs Terminal */}
        <Card className="bg-black/80 border-zinc-800 shadow-2xl overflow-hidden flex flex-col h-64">
          <div className="bg-zinc-900/50 px-4 py-2 flex items-center gap-2 border-b border-zinc-800">
            <Terminal size={14} className="text-zinc-400" />
            <span className="text-xs text-zinc-500 font-mono">
              Terminal Output
            </span>
          </div>
          <ScrollArea className="flex-1 p-4 font-mono text-xs text-green-500/90">
            {logs.map((log, i) => (
              <div key={i} className="break-all whitespace-pre-wrap mb-1">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
};
