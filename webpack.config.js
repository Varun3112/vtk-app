const path = require('path');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const appDirectory = fs.realpathSync(process.cwd());
const resolveAppPath = relativePath => path.resolve(appDirectory, relativePath);
const host = process.env.HOST || 'localhost';

const vtkRules = require("vtk.js/Utilities/config/dependency.js").webpack.core
  .rules;

module.exports = {
  entry: {
    app: path.join(__dirname, "src", "index.js"),
  },
  output: {
    path: path.join(__dirname, "dist"),
    filename: "[name].js",
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: "babel-loader",
        exclude: /node_modules/,
      }
    ].concat(vtkRules),
  },
  resolve: {
    extensions: [".js"],
  },
  devServer: {
    devServer: {
        contentBase: resolveAppPath('public'),
        compress: true,
        hot: true,
        host,
        port: 3000,
        publicPath: '/',
    
      },
  },
  node:{
    fs:'empty'
  }
};