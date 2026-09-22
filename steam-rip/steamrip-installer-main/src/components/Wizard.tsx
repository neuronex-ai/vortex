import { useState, useCallback } from "react";
import { StepSelection } from "./StepSelection";
import { StepConfig } from "./StepConfig";
import { StepInstall } from "./StepInstall";
import { StepFinish } from "./StepFinish";
import { GameInfo, Runner } from "../types";
import { Card, CardContent } from "@/components/ui/card";

export const Wizard = () => {
  const [step, setStep] = useState(1);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [selectedExecutable, setSelectedExecutable] = useState("");
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
  const [addToHeroic, setAddToHeroic] = useState(true);
  const [installedPath, setInstalledPath] = useState("");

  const handleSelectionNext = useCallback((info: GameInfo) => {
    setGameInfo(info);
    if (info.executables.length > 0) {
      setSelectedExecutable(info.executables[0]);
    }
    setStep(2);
  }, []);

  const handleConfigNext = useCallback(
    (runner: Runner, addHeroic: boolean, exe: string) => {
      setSelectedRunner(runner);
      setAddToHeroic(addHeroic);
      setSelectedExecutable(exe);
      setStep(3);
    },
    [],
  );

  const handleInstallNext = useCallback((path: string) => {
    setInstalledPath(path);
    setStep(4);
  }, []);

  return (
    <div className="w-full h-screen bg-background text-foreground flex flex-col p-8">
      <div className="w-full flex-1 flex flex-col">
        <h1 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          SteamRIP Installer
        </h1>

        <Card className="w-full flex-1 border-zinc-800 bg-zinc-900/50 backdrop-blur-xl relative overflow-hidden">
          <CardContent className="h-full p-8 flex flex-col">
            {step === 1 && <StepSelection onNext={handleSelectionNext} />}

            {step === 2 && gameInfo && (
              <StepConfig gameInfo={gameInfo} onNext={handleConfigNext} />
            )}

            {step === 3 && gameInfo && selectedRunner && (
              <StepInstall
                gamePath={gameInfo.path}
                gameName={gameInfo.name}
                executable={selectedExecutable}
                runner={selectedRunner}
                addToHeroicProp={addToHeroic}
                onNext={handleInstallNext}
              />
            )}

            {step === 4 && <StepFinish Path={installedPath} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
