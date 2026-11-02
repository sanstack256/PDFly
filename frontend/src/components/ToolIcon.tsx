"use client";

import React from "react";
import {
  Combine,
  Split,
  Trash2,
  Copy,
  Layers,
  RotateCw,
  Hash,
  Stamp,
  Minimize2,
  Wrench,
  ScanText,
  Image as ImageIcon,
  FileText,
  Presentation,
  FileSpreadsheet,
  Globe,
  FileImage,
  Archive,
  Edit3,
  Lock,
  Unlock,
  PenTool,
  EyeOff,
  FileQuestion,
  LucideProps,
} from "lucide-react";

interface ToolIconProps extends LucideProps {
  name: string;
}

export default function ToolIcon({ name, ...props }: ToolIconProps) {
  switch (name) {
    case "Combine":
      return <Combine {...props} />;
    case "Split":
      return <Split {...props} />;
    case "Trash2":
      return <Trash2 {...props} />;
    case "Copy":
      return <Copy {...props} />;
    case "Layers":
      return <Layers {...props} />;
    case "RotateCw":
      return <RotateCw {...props} />;
    case "Hash":
      return <Hash {...props} />;
    case "Stamp":
      return <Stamp {...props} />;
    case "Minimize2":
      return <Minimize2 {...props} />;
    case "Wrench":
      return <Wrench {...props} />;
    case "ScanText":
      return <ScanText {...props} />;
    case "Image":
      return <ImageIcon {...props} />;
    case "FileText":
      return <FileText {...props} />;
    case "Presentation":
      return <Presentation {...props} />;
    case "FileSpreadsheet":
      return <FileSpreadsheet {...props} />;
    case "Globe":
      return <Globe {...props} />;
    case "FileImage":
      return <FileImage {...props} />;
    case "Archive":
      return <Archive {...props} />;
    case "Edit3":
      return <Edit3 {...props} />;
    case "Lock":
      return <Lock {...props} />;
    case "Unlock":
      return <Unlock {...props} />;
    case "PenTool":
      return <PenTool {...props} />;
    case "EyeOff":
      return <EyeOff {...props} />;
    default:
      return <FileQuestion {...props} />;
  }
}

