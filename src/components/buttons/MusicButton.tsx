import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import { sound } from '@pixi/sound';
import Button from './Button';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function MusicButton() {
  const { t } = useI18n();
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    if (musicUrl) {
      sound.add('background', musicUrl).loop = true;
    }
  }, [musicUrl]);

  const flipSwitch = async () => {
    if (isPlaying) {
      sound.stop('background');
    } else {
      await sound.play('background');
    }
    setPlaying(!isPlaying);
  };

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)))
      )
        return;
      if (event.key === 'm' || event.key === 'M') {
        void flipSwitch();
      }
    },
    [flipSwitch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return (
    <>
      <Button
        onClick={() => void flipSwitch()}
        className="hidden lg:block"
        title={t('Play AI generated music (press m to play/mute)')}
        imgUrl={volumeImg}
      >
        {isPlaying ? t('Mute') : t('Music')}
      </Button>
    </>
  );
}
