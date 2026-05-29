'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, MapPin, Loader2, ChevronRight } from 'lucide-react';
import { createFarm } from '@/app/actions/farms';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = 'identity' | 'gps';

export default function CreateFarmWizard({ open, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>('identity');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [locError, setLocError] = useState('');
  const [serverError, setServerError] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);

  if (!open) return null;

  function handleClose() {
    if (isPending) return;
    setStep('identity');
    setName(''); setAddress(''); setLat(''); setLng('');
    setLocError(''); setServerError('');
    onClose();
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser.');
      return;
    }
    setGettingLocation(true);
    setLocError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGettingLocation(false);
      },
      () => {
        setLocError('Could not get your location. Please enter coordinates manually.');
        setGettingLocation(false);
      }
    );
  }

  function handleCreate() {
    setServerError('');
    startTransition(async () => {
      const result = await createFarm({
        name,
        address: address || undefined,
        gps_lat: lat ? parseFloat(lat) : null,
        gps_lng: lng ? parseFloat(lng) : null,
        gps_zoom: 14,
      });
      if (result.error) {
        setServerError(result.error);
        return;
      }
      // Go straight to the new farm's dashboard — it shows the setup steps
      router.push(`/${result.farmId}/dashboard`);
      handleClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Create a new farm
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Step {step === 'identity' ? '1' : '2'} of 2
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="h-9 w-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1 — Name & location */}
        {step === 'identity' && (
          <div className="px-6 py-5 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Farm name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Sunrise Almonds"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Address / location <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="e.g. Jericho, West Bank"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setStep('gps')}
                disabled={!name.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — GPS */}
        {step === 'gps' && (
          <div className="px-6 py-5 flex flex-col gap-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              GPS coordinates help position your farm on the map. You can skip this and add them later in Settings.
            </p>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={gettingLocation}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-300 dark:border-brand-700 px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors disabled:opacity-50 w-fit"
            >
              {gettingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              Use my location
            </button>
            {locError && (
              <p className="text-xs text-red-600 dark:text-red-400">{locError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Latitude
                </label>
                <input
                  type="number"
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                  placeholder="31.7683"
                  step="0.000001"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Longitude
                </label>
                <input
                  type="number"
                  value={lng}
                  onChange={e => setLng(e.target.value)}
                  placeholder="35.2137"
                  step="0.000001"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            {serverError && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                {serverError}
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setStep('identity')}
                disabled={isPending}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Farm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
