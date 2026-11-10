import { errorMessage } from './i18n';
import { toast } from 'react-toastify';

export async function toastOnError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error: any) {
    toast.error(errorMessage(error));
    throw error;
  }
}
