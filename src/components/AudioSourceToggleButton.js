// src/components/AudioSourceToggleButton.js
import React from "react";
import { VscUnmute, VscMute } from "react-icons/vsc";

const AudioSourceToggleButton = ({ audioSource, onToggle }) => {
  const isDesktop = audioSource === "desktop";
  const title = isDesktop ? "切换到麦克风" : "切换到桌面音频";
  const Icon = isDesktop ? VscUnmute : VscMute;

  return (
    <button onClick={onToggle} title={title}>
      <Icon />
    </button>
  );
};

export default AudioSourceToggleButton;
