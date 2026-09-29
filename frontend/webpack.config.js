const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables from .env if present
const envPath = path.resolve(__dirname, '.env');
const envVars = fs.existsSync(envPath) ? dotenv.config({ path: envPath }).parsed || {} : {};

// Filter only REACT_APP_ variables for client injection
const clientEnv = Object.keys(process.env)
  .concat(Object.keys(envVars))
  .reduce((acc, key) => {
    if (key.startsWith('REACT_APP_')) {
      acc[`process.env.${key}`] = JSON.stringify(process.env[key] || envVars[key]);
    }
    return acc;
  }, {
    'process.env.REACT_APP_API_URL': JSON.stringify(
      process.env.REACT_APP_API_URL || envVars.REACT_APP_API_URL || 'http://localhost:5000/api'
    ),
  });

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'static/js/[name].[contenthash:8].js',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: 'defaults' }],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      favicon: false,
    }),
    new webpack.DefinePlugin(clientEnv),
  ],
  devServer: {
    port: 3000,
    historyApiFallback: true,
    hot: true,
    client: {
      overlay: true,
    },
  },
};
