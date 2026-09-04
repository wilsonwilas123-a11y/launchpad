import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { sampleSpec } from '../lib/sampleSpec';
import { AmbientBackdrop } from '../components/motion/AmbientBackdrop';
import LandingNav from '../components/landing/LandingNav';
import HeroSection from '../components/landing/HeroSection';
import Capabilities from '../components/landing/Capabilities';
import HowItWorks from '../components/landing/HowItWorks';
import Examples from '../components/landing/Examples';
import FinalCta from '../components/landing/FinalCta';
import LandingFooter from '../components/landing/LandingFooter';

/**
 * The landing page. It stays useful when the API is down: the hero falls back to
 * a local sample spec and the capability list to its built-in copy, so the page
 * is never a spinner or an error.
 */
export default function LandingPage({ showHowItWorksFirst }) {
  const [types, setTypes] = useState([]);
  const [examples, setExamples] = useState([]);
  const [loadingExamples, setLoadingExamples] = useState(true);
  const [preview, setPreview] = useState({ spec: sampleSpec, slug: 'nova' });

  useEffect(() => {
    let alive = true;
    api
      .catalog()
      .then((data) => alive && setTypes(data.websiteTypes || []))
      .catch(() => {});
    api
      .publicGallery()
      .then((data) => {
        if (!alive) return;
        setExamples(data.items || []);
        setLoadingExamples(false);
      })
      .catch(() => alive && setLoadingExamples(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const slug = examples[0]?.slug || 'nova';
    api
      .publicSite(slug)
      .then((site) => alive && setPreview({ spec: site, slug }))
      .catch(() => alive && setPreview({ spec: sampleSpec, slug: 'nova' }));
    return () => {
      alive = false;
    };
  }, [examples.length]);

  useEffect(() => {
    if (showHowItWorksFirst) document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showHowItWorksFirst]);

  return (
    <div className="relative min-h-full overflow-x-clip">
      <AmbientBackdrop />
      <div className="relative">
        <LandingNav />
        <HeroSection spec={preview.spec} slug={preview.slug} />
        <Capabilities types={types} />
        <HowItWorks />
        <Examples items={examples} loading={loadingExamples} />
        <FinalCta />
        <LandingFooter />
      </div>
    </div>
  );
}
