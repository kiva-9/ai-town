import { useI18n } from './i18n';
import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
import a16zImg from '../assets/a16z.png';
import convexImg from '../assets/convex.svg';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState } from 'react';
import ReactModal from 'react-modal';
import MusicButton from './components/buttons/MusicButton.tsx';
import Button from './components/buttons/Button.tsx';
import InteractButton from './components/buttons/InteractButton.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import { MAX_HUMAN_PLAYERS } from '../convex/constants.ts';
import PoweredByConvex from './components/PoweredByConvex.tsx';

export default function Home() {
  const { t, locale, setLocale } = useI18n();
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
      <PoweredByConvex />

      <ReactModal
        isOpen={helpModalOpen}
        onRequestClose={() => setHelpModalOpen(false)}
        style={modalStyles}
        contentLabel={t('Help modal')}
        ariaHideApp={false}
      >
        <div className="font-body">
          <h1 className="text-center text-4xl font-bold font-display game-title">{t('Help')}</h1>
          <p>
            {t(
              'Welcome to AI town. AI town supports both anonymous spectators and logged in interactivity.',
            )}
          </p>
          <h2 className="text-3xl mt-4">{t('Spectating')}</h2>
          <p>
            {t(
              'Click and drag to move around the town, and scroll in and out to zoom. You can click on an individual character to view its chat history.',
            )}
          </p>
          <h2 className="text-3xl mt-4">{t('Interactivity')}</h2>
          <p>
            {t(
              'Click Interact to join the simulation. Your character appears on the map with a highlighted circle underneath.',
            )}
          </p>
          <p className="mt-4">
            {t('Controls:')} {t('Click to navigate around.')}
          </p>
          <p className="mt-4">
            {t(
              'Click a character, then Start conversation. They will walk toward you and begin chatting when nearby. Leave by moving away or selecting Leave conversation. Incoming invitations appear in the conversation panel.',
            )}
          </p>
          <p className="mt-4">
            {t(
              'The town supports {count} human players at a time. After five idle minutes you are automatically removed.',
              { count: MAX_HUMAN_PLAYERS },
            )}
          </p>
          <button className="mt-4 p-2 bg-clay-700" onClick={() => setHelpModalOpen(false)}>
            {t('Close')}
          </button>
        </div>
      </ReactModal>
      {/*<div className="p-3 absolute top-0 right-0 z-10 text-2xl">
        <Authenticated>
          <UserButton afterSignOutUrl="/ai-town" />
        </Authenticated>

        <Unauthenticated>
          <LoginButton />
        </Unauthenticated>
      </div> */}

      <div className="w-full lg:h-screen min-h-screen relative isolate overflow-hidden lg:p-8 shadow-2xl flex flex-col justify-start">
        <h1 className="mx-auto text-4xl p-3 sm:text-8xl lg:text-9xl font-bold font-display leading-none tracking-wide game-title w-full text-left sm:text-center sm:w-auto">
          {t('AI Town')}
        </h1>

        <div className="max-w-xs md:max-w-xl lg:max-w-none mx-auto my-4 text-center text-base sm:text-xl md:text-2xl text-white leading-tight shadow-solid">
          {t('A virtual town where AI characters live, chat and socialize.')}
          {/* <Unauthenticated>
            <div className="my-1.5 sm:my-0" />
            Log in to join the town
            <br className="block sm:hidden" /> and the conversation!
          </Unauthenticated> */}
        </div>

        <label className="mx-auto mb-3 text-white flex items-center gap-2">
          {t('Language')}
          <select
            aria-label={t('Language')}
            value={locale}
            onChange={(event) => setLocale(event.target.value as 'zh-CN' | 'en')}
            className="bg-brown-800 border-2 border-brown-600 px-3 py-1"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <Game />

        <footer className="justify-end bottom-0 left-0 w-full flex items-center mt-4 gap-3 p-6 flex-wrap pointer-events-none">
          <div className="flex gap-4 flex-grow pointer-events-none">
            <FreezeButton />
            <MusicButton />
            <Button href="https://github.com/a16z-infra/ai-town" imgUrl={starImg}>
              {t('Star')}
            </Button>
            <InteractButton />
            <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
              {t('Help')}
            </Button>
          </div>
          <a href="https://a16z.com">
            <img className="w-8 h-8 pointer-events-auto" src={a16zImg} alt="a16z" />
          </a>
          <a href="https://convex.dev/c/ai-town">
            <img className="w-20 h-8 pointer-events-auto" src={convexImg} alt="Convex" />
          </a>
        </footer>
        <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
      </div>
    </main>
  );
}

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(90vw, 720px)',
    maxWidth: '90vw',
    maxHeight: '85vh',
    overflow: 'auto',

    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: 'var(--font-body), sans-serif',
  },
};
