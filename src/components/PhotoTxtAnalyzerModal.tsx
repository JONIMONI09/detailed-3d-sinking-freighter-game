import React, { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  ArrowRight,
  Upload,
  CheckCircle2,
  Unlock,
  Download,
  X,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { soundEngine } from '../audio/SoundEngine';

interface PhotoTxtAnalyzerModalProps {
  isOpen: boolean;
  onClose: () => void;
  overchargedUnlocked: boolean;
  onUnlockOvercharged: () => void;
  onTriggerInstantKeelBreach: () => void;
}

interface PresetPhotoFile {
  id: string;
  originalName: string;
  renamedTxt: string;
  sizeBytes: string;
  summary: string;
  rawHeaderHex: string;
  decodedTextContent: string;
  secretFound: string;
}

const PRESET_BLACKBOX_PHOTOS: PresetPhotoFile[] = [
  {
    id: 'manifest_photo',
    originalName: 'freighter_secret_photo_section_B.jpg',
    renamedTxt: 'freighter_secret_photo_section_B.txt',
    sizeBytes: '48,320 bytes',
    summary: 'Intercepted surveillance photo from the lower cargo hold (Section B). Contains hidden plaintext after the JPEG EOI marker (FF D9).',
    rawHeaderHex:
      'FF D8 FF E0 00 10 4A 46 49 46 00 01 02 01 00 60 00 60 00 00 FF FE 00 3B 43 4F 4E 46 49 44 45 4E 54 49 41 4C ... FF D9',
    decodedTextContent: `JFIF;CREATOR: NAVAL BLACKBOX CAM #04 (MS POSEIDON VII)
[BINARY_IMAGE_STREAM_SKIPPED: 4128 lines]
...‰PNG/JPEG_END_MARKER_FFD9...

====================================================================
>>> HIDDEN PLAINTEXT FOUND IN THE PHOTO (AFTER RENAMING TO .TXT) <<<
====================================================================
SHIP ID           : MS POSEIDON VII (IMO 9482710)
CLASSIFIED LOG    : PROJECT DEEP-SEA BREACHER
STRUCTURAL ANALYSIS:
  1. CRITICAL KEEL WEAK POINT:
     Lower deck sections B & C (engine-room bulkhead at Y = -2.2m).
     If the watertight bulkheads (bulkhead doors) are OPEN
     and 2x TNT or C4 are detonated on the hull, the keel breaks!
  2. ALL DOORS & ENTRANCES:
     - Bridge (deck +10m): port & starboard wing doors [E]
     - Crew deck (deck +6m): cabin & mess doors [E]
     - Main deck (deck +2m): bow access house & midship stairwell [E]
     - Lower deck (deck -2.2m): 3 hydraulic watertight doors [E]
     - NO CLIP: solid ship-local OBB collision active on every deck!
  3. OVERCHARGE UNLOCK CODE:
     [ CODE: ARGON-SONNET-OMEGA-TNT ]
     -> Enables 250% blast power & unlimited special ammo!
====================================================================`,
    secretFound: 'WEAK POINT & OVERCHARGE CODE FOUND: [ARGON-SONNET-OMEGA-TNT]',
  },
  {
    id: 'hull_blueprint',
    originalName: 'hull_bulkhead_blueprint_scan.png',
    renamedTxt: 'hull_bulkhead_blueprint_scan.txt',
    sizeBytes: '72,910 bytes',
    summary: 'Technical scan of the 4 watertight compartments with embedded tEXt metadata for sinking physics.',
    rawHeaderHex:
      '89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52 00 00 07 80 00 00 04 38 ... 74 45 58 74',
    decodedTextContent: `‰PNG
IHDR8tEXtSoftwareNavalCAD HydroSim v5.5
====================================================================
>>> EXTRACTED .TXT CHUNK FROM PNG IMAGE STRUCTURE <<<
====================================================================
HYDRODYNAMIC SINKING SIMULATION (REAL-TIME ARCHIMEDES MODEL):
- SECTION A (BOW)               : flooding creates strong bow-heavy trim (pitch up to -28°).
- SECTION B (MIDSHIP)           : massively increases draft; red barrels amplify explosions.
- SECTION C (ENGINE ROOM)       : contains the 12-cylinder diesel engine & bilge pump console.
- SECTION D (STERN / PROPELLER) : flooding pushes the stern underwater.

DAMAGE CONTROL TIP:
With key [5] (plasma welder) hull leaks can be sealed underwater
or in the cargo hold! Activate the bilge pumps in the
engine room with [E] to pump water out!
====================================================================`,
    secretFound: 'HYDRO-DATENSATZ: KIELBRUCH BEI >70% FLUTUNG IN SEKTION B & C',
  },
];

export const PhotoTxtAnalyzerModal: React.FC<PhotoTxtAnalyzerModalProps> = ({
  isOpen,
  onClose,
  overchargedUnlocked,
  onUnlockOvercharged,
  onTriggerInstantKeelBreach,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_BLACKBOX_PHOTOS[0].id);
  const [isRenamedToTxt, setIsRenamedToTxt] = useState<boolean>(true);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [customTxtOutput, setCustomTxtOutput] = useState<string | null>(null);
  const [customAsciiStrings, setCustomAsciiStrings] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState<string>('');

  if (!isOpen) return null;

  const activePreset =
    PRESET_BLACKBOX_PHOTOS.find((p) => p.id === selectedPresetId) || PRESET_BLACKBOX_PHOTOS[0];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    soundEngine.playUiClick();

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const renamed = `${baseName}.txt`;
    setCustomFileName(`${file.name}  ➔  ${renamed}`);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Build Hex Preview of first 96 bytes
      const hexPreview = Array.from(bytes.slice(0, 96))
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');

      // Decode UTF-8 / Latin1 text representation
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const rawText = decoder.decode(bytes.slice(0, 32000));

      // Extract readable ASCII sequences (>= 4 printable characters)
      const matches = rawText.match(/[A-Za-z0-9ÄÖÜäöüß_\-:.,;/()[\]=+#@!? ]{5,}/g) || [];
      const cleanedMatches = matches
        .map((m) => m.trim())
        .filter((m) => m.length >= 5)
        .slice(0, 120);

      setCustomAsciiStrings(cleanedMatches);
      setCustomTxtOutput(
        `=== FILE RENAMED: ${file.name} -> ${renamed} ===\n` +
          `FILE SIZE: ${file.size.toLocaleString('en-US')} bytes | TYPE: ${file.type || 'Binary/Image'}\n` +
          `HEX HEADER (FIRST 96 BYTES):\n${hexPreview}\n\n` +
          `=== READABLE TEXT STRINGS FOUND IN THE IMAGE FILE ===\n` +
          (cleanedMatches.length > 0
            ? cleanedMatches.map((s, idx) => `[${String(idx + 1).padStart(3, '0')}] ${s}`).join('\n')
            : 'No long ASCII text blocks found in the header.') +
          `\n\n=== RAW DATA TEXT VIEW (.TXT STREAM) ===\n` +
          rawText.slice(0, 6000)
      );
      setIsRenamedToTxt(true);
    } catch (err) {
      setCustomTxtOutput(`Error reading file: ${String(err)}`);
    }
  };

  const handleDownloadTxt = () => {
    soundEngine.playUiClick();
    const content = customTxtOutput || activePreset.decodedTextContent;
    const filename = customFileName
      ? customFileName.split('➔')[1]?.trim() || 'photo_analysis.txt'
      : activePreset.renamedTxt;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayedText = customTxtOutput || activePreset.decodedTextContent;
  const filteredText = searchFilter.trim()
    ? displayedText
        .split('\n')
        .filter((line) => line.toLowerCase().includes(searchFilter.toLowerCase()))
        .join('\n') || 'No lines match the search term.'
    : displayedText;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-3 md:p-6">
      <div className="w-full max-w-4xl max-h-[96dvh] sm:max-h-[92dvh] naval-panel-amber rounded-xl flex flex-col overflow-hidden border border-amber-500/50 shadow-2xl">
        {/* Top Bar */}
        <div className="px-4 sm:px-5 py-3 sm:py-4 bg-slate-900/95 border-b border-slate-700/80 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-amber-400 shrink-0">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono-tech font-bold uppercase bg-amber-500 text-slate-950 rounded">
                  BLACKBOX FORENSICS LAB
                </span>
                <span className="text-xs font-mono-tech text-amber-300/80 hidden sm:inline">
                  PHOTO ➔ .TXT DECODER & HEX ANALYZER
                </span>
              </div>
              <h2 className="font-display text-lg md:text-xl font-bold text-white tracking-wide">
                RENAME IMAGE FILE TO .TXT & ANALYZE ITS CONTENT
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-2 shrink-0 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 md:p-6 space-y-4 overflow-y-auto naval-scroll flex-1">
          {/* File Selection + Custom Upload Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {PRESET_BLACKBOX_PHOTOS.map((preset) => {
              const active = !customTxtOutput && selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    soundEngine.playUiClick();
                    setCustomTxtOutput(null);
                    setCustomFileName(null);
                    setSelectedPresetId(preset.id);
                    setIsRenamedToTxt(true);
                  }}
                  className={`p-3.5 rounded-lg border text-left transition cursor-pointer flex flex-col justify-between ${
                    active
                      ? 'bg-amber-500/15 border-amber-400 text-white shadow-lg shadow-amber-500/10'
                      : 'bg-slate-900/80 border-slate-700/70 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono-tech text-amber-400 mb-1">
                      <span>SHIP BLACKBOX</span>
                      <span>{preset.sizeBytes}</span>
                    </div>
                    <div className="font-mono-tech text-xs font-semibold text-white truncate flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="line-through text-slate-400">{preset.originalName}</span>
                    </div>
                    <div className="font-mono-tech text-xs font-bold text-emerald-400 truncate flex items-center gap-1.5 mt-0.5">
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>{preset.renamedTxt}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{preset.summary}</p>
                </button>
              );
            })}

            {/* Upload Own Photo to Rename to .TXT */}
            <label className="p-3.5 rounded-lg border border-dashed border-sky-400/60 bg-sky-950/20 hover:bg-sky-950/35 text-left transition cursor-pointer flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono-tech text-sky-400 mb-1">
                  <span>CHECK YOUR OWN PHOTO</span>
                  <span>LIVE DECODER</span>
                </div>
                <div className="font-display font-bold text-sm text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Upload photo ➔ convert to .TXT</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1.5">
                  Choose any image (.jpg, .png, etc.) from your device to read it directly as{' '}
                  <code className="text-amber-300">.txt</code> and find hidden text!
                </p>
              </div>
              <input type="file" accept="*/*" onChange={handleFileUpload} className="hidden" />
              <div className="mt-2 text-[11px] font-mono-tech text-sky-300 underline">
                {customFileName ? `Loaded: ${customFileName}` : 'Click here to choose a file...'}
              </div>
            </label>
          </div>

          {/* Interactive Rename Toggle Banner */}
          <div className="p-3.5 rounded-lg bg-slate-900/95 border border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-mono-tech uppercase text-slate-400">FILENAME:</span>
              <span
                className={`px-2.5 py-1 rounded text-xs font-mono-tech font-bold ${
                  !isRenamedToTxt
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-800 text-slate-400 line-through'
                }`}
              >
                {customFileName ? customFileName.split('➔')[0] : activePreset.originalName}
              </span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
              <span
                className={`px-2.5 py-1 rounded text-xs font-mono-tech font-bold ${
                  isRenamedToTxt
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {customFileName ? customFileName.split('➔')[1] : activePreset.renamedTxt}
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  soundEngine.playUiClick();
                  setIsRenamedToTxt(!isRenamedToTxt);
                }}
                className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono-tech font-bold text-xs cursor-pointer transition"
              >
                {isRenamedToTxt ? 'OPENED AS .TXT (ACTIVE)' : 'RENAME TO .TXT NOW'}
              </button>
              <button
                onClick={handleDownloadTxt}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-mono-tech text-xs flex items-center gap-1.5 cursor-pointer transition"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Save .TXT</span>
              </button>
            </div>
          </div>

          {/* Search Filter & Decoded Output Viewer */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-mono-tech text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {customTxtOutput
                    ? `OWN FILE ANALYZED (${customAsciiStrings.length} text sequences extracted)`
                    : activePreset.secretFound}
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search the .txt content..."
                  className="pl-8 pr-3 py-1 rounded bg-slate-950 border border-slate-700 text-xs font-mono-tech text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {isRenamedToTxt ? (
              <pre className="p-4 rounded-lg bg-[#05080C] border border-emerald-500/40 text-xs md:text-sm font-mono-tech text-emerald-300 overflow-x-auto max-h-[38dvh] sm:max-h-64 naval-scroll whitespace-pre-wrap leading-relaxed shadow-inner">
                {filteredText}
              </pre>
            ) : (
              <div className="p-6 rounded-lg bg-slate-950 border border-slate-800 text-center space-y-3">
                <ImageIcon className="w-10 h-10 text-sky-400 mx-auto opacity-80" />
                <div className="text-sm font-mono-tech text-slate-300">
                  File is still marked as a binary image (<code>.jpg/.png</code>).
                </div>
                <div className="text-xs font-mono-tech text-slate-500 max-w-lg mx-auto">
                  HEX-STREAM: {activePreset.rawHeaderHex}
                </div>
                <button
                  onClick={() => {
                    soundEngine.playUiClick();
                    setIsRenamedToTxt(true);
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 font-display font-bold text-xs tracking-wider cursor-pointer"
                >
                  CHANGE EXTENSION TO .TXT & DECODE TEXT
                </button>
              </div>
            )}
          </div>

          {/* Unlockable Secret Action Bar from the decoded .txt */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-amber-500/15 via-red-500/10 to-slate-900 border border-amber-500/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-mono-tech uppercase text-amber-300 font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>APPLY SECRET CODE FROM THE .TXT FILE:</span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Activates the code hidden in the photo <code>ARGON-SONNET-OMEGA-TNT</code> (250% blast radius & keel-breaker charges).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  soundEngine.playPlantCharge();
                  onUnlockOvercharged();
                }}
                className={`px-4 py-2.5 rounded-lg font-display font-bold text-xs tracking-wider flex items-center gap-2 cursor-pointer transition ${
                  overchargedUnlocked
                    ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-300'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20'
                }`}
              >
                <Unlock className="w-4 h-4" />
                {overchargedUnlocked ? 'OVERCHARGE TNT ACTIVE!' : 'ACTIVATE CODE (MEGA TNT)'}
              </button>

              <button
                onClick={() => {
                  onTriggerInstantKeelBreach();
                  onClose();
                }}
                className="px-3.5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs tracking-wider cursor-pointer transition"
              >
                BLAST THE WEAK POINT NOW!
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
