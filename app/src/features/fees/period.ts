import { todayYmd } from '../../lib/dates';

/** Current yyyy-mm in Indian time. */
export const currentPeriodIst = () => todayYmd().slice(0, 7);
