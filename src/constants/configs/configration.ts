import { DEFAULT_PORT } from './config';

// Info Murky (20240422) This config is special for ConfigModule
export default () => ({
  port: parseInt(process.env.PORT, 10) || DEFAULT_PORT,
});
