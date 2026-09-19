import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { readSignupRejection, signupRejection } from './app/core/auth-error';

// Before bootstrap, and it must stay before it: auth-js clears the fragment
// during its own initialize(). See core/auth-error.ts.
signupRejection.set(readSignupRejection(location.hash));

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
