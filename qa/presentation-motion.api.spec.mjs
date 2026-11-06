import { test, expect } from '@playwright/test';
import { normalizeMotion, motionTimeline } from '../src/modules/presentation-mode/presentation-motion.mjs';
import { presentationPlayers } from '../src/modules/presentation-mode/presentation-object-tools.mjs';

test('motion accepts only supported bounded steps and orders objects together', () => {
  expect(normalizeMotion([{effect:'execute',duration:500},{effect:'move',duration:90000,x:Infinity,y:-9000}])).toEqual([{effect:'move',order:1,duration:5000,x:200,y:-200}]);
  expect(normalizeMotion(null)).toEqual([]);
  expect(motionTimeline({a:{motion:[{effect:'fade-in',order:2}]},b:{motion:[{effect:'fade-out',order:1}]}}).map(s=>s.field)).toEqual(['b','a']);
});

test('player picker reads squad portraits including uploaded image data without accepting executable URLs', () => {
  const state = {players:[
    {id:'uploaded',name:'Uploaded',photoUrl:'data:image/webp;base64,abc'},
    {id:'remote',photoUrl:'https://example.com/a.png'},
    {id:'missing'},
    {id:'script',photoUrl:'javascript:alert(1)'},
    {id:'html',photoUrl:'data:text/html;base64,abc'},
    {id:'guest',countsInSquad:false,photoUrl:'/a.png'},
    {id:'trial',rosterType:'temporary',photoUrl:'/a.png'},
    {id:'archived',archivedAt:'2026-11-01',photoUrl:'/a.png'},
  ]};
  const before = structuredClone(state);
  expect(presentationPlayers(state).map(p=>[p.id,p.photoUrl])).toEqual([
    ['uploaded','data:image/webp;base64,abc'], ['remote','https://example.com/a.png'], ['missing',''], ['script',''], ['html',''],
  ]);
  expect(state).toEqual(before);
});
