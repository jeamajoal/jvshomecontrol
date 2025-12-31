import React from 'react';

import jvsAutomateLogo from '../assets/jvsautomate-logo.svg';

const AboutPanel = () => {
  return (
    <div className="w-full h-full overflow-auto p-2 md:p-3">
      <div className="w-full">
        <div className="glass-panel border border-white/10 p-4 md:p-5">
          <div className="text-[11px] md:text-xs uppercase tracking-[0.2em] text-white/55 font-semibold">
            About
          </div>
          <div className="mt-1 text-xl md:text-2xl font-extrabold tracking-tight text-white">
            JVS Home Control
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="w-full">
                <img
                  src={jvsAutomateLogo}
                  alt="JVS Automate"
                  className="w-full h-auto object-contain"
                />
                <div className="mt-4 text-sm md:text-base font-extrabold text-white/90 text-center">JVS Automation</div>
                <div className="mt-1 text-xs md:text-sm text-white/60 text-center">jvsautomate.com</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">Contact</div>
              <div className="mt-3 text-sm md:text-base font-bold text-white/85">info@jvsautomate.com</div>
              <div className="mt-2 text-sm md:text-base font-bold text-white/85">(931) 450-8639</div>
              <div className="mt-2 text-xs text-white/50">Manchester, TN • Serving Middle Tennessee & Remote Clients Nationwide</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">
                A Practical Approach
              </div>
              <div className="mt-2 text-sm md:text-base font-bold text-white/85">
                Automation that fits real workflows
              </div>
              <div className="mt-2 text-xs md:text-sm text-white/55 leading-relaxed">
                The goal is to reduce friction between systems you already rely on — without forcing a full rebuild.
                We start by understanding how work actually happens day to day, then automate the parts that create
                repeated effort, errors, and uncertainty.
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Discovery first</div>
                  <div className="mt-1 text-xs text-white/55">Clarify constraints and workflow before building.</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Systems behavior</div>
                  <div className="mt-1 text-xs text-white/55">Design for handoffs, edge cases, and failure modes.</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Maintainable results</div>
                  <div className="mt-1 text-xs text-white/55">Clear notes and solutions your team can support.</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:p-5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">Background</div>
              <div className="mt-2 text-xs md:text-sm text-white/55 leading-relaxed">
                Over two decades working with automation, integrations, and systems that support real operations.
                The focus has consistently been the same: remove repetitive work, reduce errors, and make outcomes predictable.
              </div>

              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">How I Work</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Direct collaboration</div>
                    <div className="mt-1 text-xs text-white/55">You work with me directly — no handoffs.</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Tested in real scenarios</div>
                    <div className="mt-1 text-xs text-white/55">Validated against how your workflow actually runs.</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Documentation included</div>
                    <div className="mt-1 text-xs text-white/55">Clear guidance on what was built and how to support it.</div>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 font-semibold">Outside of Work</div>
                <div className="mt-2 text-xs md:text-sm text-white/55 leading-relaxed">
                  Based in Manchester, Tennessee. Outside of work: family life, homeschooling, and keeping things balanced.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPanel;
