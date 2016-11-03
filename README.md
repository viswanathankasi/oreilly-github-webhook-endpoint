[![devDependency Status](https://david-dm.org/viswanathankasi/oreilly-github-webhook-endpoint/dev-status.svg?style=flat)](https://david-dm.org/viswanathankasi/oreilly-github-webhook-endpoint/dev-status.svg)

Demo Webhook Endpoint
=====================

This is a demo webhook endpoint (server) for lesson A307 of the [Mastering Advanced GitHub](#FIXME) video series at O’Reilly.

Usage
-----

  1. Make sure you have [Node.js installed](https://nodejs.org/en/download/)
  2. Clone this repo
  3. Open a Terminal and `cd` into the clone's directory
  4. Run `npm install` to get the (few) dependencies
  5. Run `npm start` to run the server

This will run the server on a **random available port** of your machine, which will change just about every time.  It will look something like this:

```text
> webhook-endpoint@1.0.0 start …/oreilly-github-webhook-endpoint
> node server.js

Demo webhook endpoint listening on port 53770
```

But this is just on your machine, and you need GitHub’s servers to be able to access it.  For this, you need some sort of tunnel that connects some network port and address visible to the internet to your own machine and port.  One of the easiest ways to accomplish that across environments and setups is **[ngrok](https://ngrok.com/)**.

  1. [Download](https://ngrok.com/download) ngrok
  2. Make a note of the port your webhook endpoint ran on; for these instructions, we'll assume it was `53770`
  3. Open another Terminal window, and run `ngrok http <the-port>`, for instance `ngrok http 53770`.

This will clear the window and run an ngrok client on your machine, acting as a sort of reverse-proxy so the internet can access your server, both over HTTPS and HTTP.  After a second or two, you should see something that looks like this:

```text
Tunnel Status                 online
Version                       2.0.19/2.0.19
Web Interface                 127.0.0.1:4040
Forwarding                    http://1420f0d6.ngrok.com -> localhost:53770
Forwarding                    https://1420f0d6.ngrok.com -> localhost:53770

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

Until you stop ngrok by hitting <kbd>Ctrl+C</kbd>, you've got your tunnel running.  You can now configure your Webhook to use the public URL based off `ngrok.com`, and this webhook server will dump the JSON payloads GitHub sends into its own Terminal console.

License
-------

This repo © 2016 Christophe Porteneuve & Delicious Insights, and is [MIT licensed](/LICENSE).
