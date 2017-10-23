module.exports = {
  entry: './src/index.js',
  target: 'web',
  output: {
    path: __dirname,
    filename: './lib/index.js',
    libraryTarget: 'umd'
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env'],
            plugins: [require('babel-plugin-transform-object-rest-spread')]
          }
        }
      }
    ]
  },
  node: {
    fs: 'empty',
    child_process: 'empty'
  }
}
