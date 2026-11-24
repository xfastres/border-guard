const AudioKit = {
  ctx: null, enabled: true, last: {},
  unlock(){
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
  },
  play(kind, pitchMul = 1){
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    const minGap = { hit:45, xp:32, coin:50, arrow:55, fire:85, frost:80, thunder:75, holy:85, slash:65, crit:60, merge:120, chest:120, level:150, boss:350 }[kind] || 60;
    if (now - (this.last[kind] || 0) < minGap) return;
    this.last[kind] = now;
    const t = this.ctx.currentTime;
    const tone = (freq, dur, type='triangle', vol=0.06, endFreq=null, delay=0) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * pitchMul, t + delay);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq * pitchMul), t + delay + dur);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.linearRampToValueAtTime(vol, t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t + delay); o.stop(t + delay + dur + 0.02);
    };
    if (kind === 'xp') tone(680, 0.08, 'sine', 0.05, 980);
    else if (kind === 'coin') { tone(880, 0.07, 'sine', 0.05); tone(1320, 0.09, 'sine', 0.045, null, 0.045); }
    else if (kind === 'arrow') tone(560, 0.06, 'triangle', 0.04, 240);
    else if (kind === 'fire') tone(170, 0.17, 'sawtooth', 0.06, 52);
    else if (kind === 'frost') tone(920, 0.12, 'sine', 0.045, 520);
    else if (kind === 'thunder') tone(420, 0.11, 'sawtooth', 0.05, 1100);
    else if (kind === 'holy') tone(760, 0.13, 'sine', 0.045, 1180);
    else if (kind === 'slash') tone(320, 0.08, 'sawtooth', 0.05, 130);
    else if (kind === 'crit') tone(520, 0.09, 'square', 0.05, 860);
    else if (kind === 'merge') { tone(523, 0.11, 'triangle', 0.08); tone(659, 0.11, 'triangle', 0.08, null, 0.07); tone(1046, 0.24, 'triangle', 0.09, null, 0.14); }
    else if (kind === 'chest') { tone(660, 0.1, 'sine', 0.07); tone(990, 0.18, 'sine', 0.08, null, 0.08); }
    else if (kind === 'level') { [523,659,784,1046].forEach((f,i)=>tone(f,0.13,'triangle',0.075,null,i*0.06)); }
    else if (kind === 'boss') { tone(130, 0.4, 'sawtooth', 0.09, 85); tone(196, 0.42, 'sawtooth', 0.08, 120, 0.16); }
    else if (kind === 'hit') tone(190, 0.07, 'square', 0.04, 95);
  }
};

export default AudioKit;
