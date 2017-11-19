![Chain Line](http://d.pr/f/Oo2c4f+)

**Get anything anywhere, powered by the blockchain.** Chain Line is a peer-to-peer shipping network that gets products and valuable items to their destinations with near-zero risk.

It works by moving an item's cost between peers as it travels through the system. A central "hub" contract controls "reserved funds" in Chain Line [smart wallets](https://github.com/notatestuser/chainline-contracts-kt/wiki/Smart-Wallet) running custom verification scripts. Chain Line features a user reputation system and relies on no external systems, operating entirely on the blockchain.

#### Learn more:&nbsp;&nbsp; [Wiki](https://github.com/notatestuser/chainline-contracts-kt/wiki) &nbsp; [User Guide](https://github.com/notatestuser/chainline-webapp/wiki/Web-App-User-Guide) &nbsp; [Intro Video](https://f001.backblazeb2.com/file/chainline-assets/explainer.mp4)
---

This is a modified version of the [Neon Wallet JS SDK](https://github.com/cityofzion/neon-js) for the Chain Line web app.

This program uses the following open source components created by City of Zion (CoZ) under the MIT License agreement. Chain Line would not have been possible without their generous contributions:

* Project: [neon-js](https://github.com/CityOfZion/neon-js)
* Developers: [City of Zion (CoZ)](https://github.com/CityOfZion) ([Contributors](https://github.com/CityOfZion/neon-js/graphs/contributors))

## To do

* Fix tests broken due to the custom verify script :)

## To run tests
```
npm run test
```

## To build to /dist:
```
npm run build
```

## To import
```
npm install --save git+https://github.com/CityOfZion/neon-js.git
```
