#!/usr/bin/env node

/**
 * Test API Script using Axios
 * Simple test for the deployed Google Apps Script API
 */

// First install axios: npm install axios
import axios from 'axios';

// Constants
const API_URL = 'https://script.google.com/macros/s/AKfycby7W-WlEbp6HYp5Okw28-R3UclZklAC9h1tlLWs4OaFDhVj-ZHEfUl_b9eaDpW9QmCH/exec';
const SECRET_KEY = 'secretkey_cust_1747609067224_3033';

// Debug mode to show full HTML responses
const DEBUG = true;

// Function to test the API
async function testApi() {
  try {
    console.log('Testing the API...');
    
    const response = await axios({
      method: 'post',
      url: API_URL,
      data: {
        action: 'getGuests',
        secretKey: SECRET_KEY
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('API Response Status:', response.status);
    console.log('API Response Data:', JSON.stringify(response.data, null, 2));
    
    // Check if we have guests data
    if (response.data.guests && Array.isArray(response.data.guests)) {
      console.log(`Number of guests: ${response.data.guests.length}`);
      
      if (response.data.guests.length > 0) {
        console.log('First guest:', response.data.guests[0]);
      }
    } else {
      console.log('No guests data found in the response');
    }
  } catch (error) {
    console.error('Error testing API:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Status:', error.response.status);
      
      // Handle possible HTML response
      if (DEBUG) {
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE html>')) {
          console.error('Received HTML response (likely an error page):');
          console.error(error.response.data.substring(0, 500) + '...');
        } else {
          console.error('Data:', error.response.data);
        }
      } else {
        console.error('Data:', error.response.data);
      }
      
      console.error('Headers:', error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up request:', error.message);
    }
  }
}

// Run the test
testApi();
