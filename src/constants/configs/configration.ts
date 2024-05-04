// Info Murky (20240422) This config is special for ConfigModule
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3001,
});
