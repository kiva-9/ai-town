import { useI18n } from '../../i18n';
import { SignInButton } from '@clerk/clerk-react';

export default function LoginButton() {
  const { t } = useI18n();
  return (
    <SignInButton>
      <button className="button text-white shadow-solid">
        <div className="inline-block bg-clay-700">
          <span>{t('Log in')}</span>
        </div>
      </button>
    </SignInButton>
  );
}
