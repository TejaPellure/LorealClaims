import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './config';

/** Makes the parsed configuration injectable everywhere via @Inject(APP_CONFIG). */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
