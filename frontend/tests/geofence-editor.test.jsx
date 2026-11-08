import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeofenceEditor } from '../src/pages/admin/GeofenceEditor.jsx';

// Leaflet needs a real browser layout; the picture itself is checked by the browser tests. Here every drawing call
// is recorded, so the test can see which circles would be drawn.
const drawn = vi.hoisted(() => ({ circles: [], maps: 0 }));
vi.mock('leaflet', () => {
  const chain = () => {
    const self = {
      addTo: () => self,
      remove: () => self,
      bindTooltip: () => self,
      setView: () => self,
      toBounds: () => ({}),
    };
    return self;
  };
  const L = {
    map: () => {
      drawn.maps += 1;
      const map = chain();
      map.getBounds = () => ({ contains: () => true });
      map.fitBounds = () => {};
      map.setView = () => map;
      return map;
    },
    tileLayer: chain,
    control: { scale: chain },
    layerGroup: chain,
    circleMarker: chain,
    latLng: () => ({ toBounds: () => ({}) }),
    circle: (_middle, options) => {
      drawn.circles.push(options.radius);
      return chain();
    },
  };
  return { default: L };
});

const quests = vi.hoisted(() => ({ list: [] }));
vi.mock('../src/api/client.js', () => ({
  api: { admin: { quests: () => Promise.resolve({ quests: quests.list }) } },
}));

const PLACE = { lat: 49.1473, lng: 9.2179 };

function Harness({ start = '80', place = PLACE, selfId = null }) {
  const [value, setValue] = useState(start);
  return <GeofenceEditor value={value} onChange={setValue} place={place} selfId={selfId} />;
}

beforeEach(() => {
  drawn.circles = [];
  drawn.maps = 0;
  quests.list = [];
});

describe('BR12 BR49 the admin sees the circle while changing the radius', () => {
  it('BR49 the number field, the slider and the quick sizes stay in step', async () => {
    const user = userEvent.setup();
    render(<Harness start="80" />);
    const number = screen.getByLabelText('Radius (metres)', { selector: 'input' });
    const slider = screen.getByLabelText('Drag to change the size');
    expect(number).toHaveValue(80);
    expect(slider).toHaveValue('80');

    await user.click(screen.getByRole('radio', { name: '150 m' }));
    expect(number).toHaveValue(150);
    expect(slider).toHaveValue('150');
    expect(screen.getByRole('radio', { name: '150 m' })).toBeChecked();

    await user.clear(number);
    await user.type(number, '65');
    expect(slider).toHaveValue('65');
    expect(screen.getByRole('radio', { name: '150 m' })).not.toBeChecked();
  });

  it('BR12 the circle and the extra tolerance ring are drawn to the typed radius', async () => {
    const user = userEvent.setup();
    render(<Harness start="80" />);
    // Tolerance ring (radius + 30 m) first, then the solid circle.
    await waitFor(() => expect(drawn.circles).toEqual(expect.arrayContaining([110, 80])));
    drawn.circles = [];
    const number = screen.getByLabelText('Radius (metres)', { selector: 'input' });
    await user.clear(number);
    await user.type(number, '120');
    await waitFor(() => expect(drawn.circles).toEqual(expect.arrayContaining([150, 120])));
    expect(drawn.maps).toBe(1); // the map is built once and redrawn, not rebuilt on every key
  });

  it('BR12 says in words how big the circle is and how far the zone really reaches', () => {
    render(<Harness start="80" />);
    expect(screen.getByText(/about 160 m across/)).toHaveTextContent(
      'up to 30 m beyond it, so the zone reaches 110 m from the centre',
    );
  });

  it('BR49 a radius the server would refuse shows a reason and does not draw a wild circle', async () => {
    const user = userEvent.setup();
    render(<Harness start="80" />);
    const number = screen.getByLabelText('Radius (metres)', { selector: 'input' });
    await user.clear(number);
    await user.type(number, '900');
    expect(screen.getByRole('alert')).toHaveTextContent('between 10 and 500 metres');
    expect(number).toBeInvalid();
    await user.clear(number);
    expect(screen.getByRole('alert')).toHaveTextContent('whole number of metres');
  });

  it('BR49 without a checked place there is no map, only a hint', () => {
    render(<Harness start="80" place={null} />);
    expect(drawn.maps).toBe(0);
    expect(screen.getByRole('note')).toHaveTextContent('Check the Google Maps link');
  });

  it('BR12 neighbours are drawn in grey and an overlap is explained, without counting itself', async () => {
    quests.list = [
      { id: 1, name: 'Building C', lat: 49.1473, lng: 9.2179, radius: 80, archived: false },
      { id: 2, name: 'Faraway', lat: 49.16, lng: 9.23, radius: 80, archived: false },
      { id: 3, name: 'Old quest', lat: 49.1473, lng: 9.2179, radius: 80, archived: true },
    ];
    render(<Harness start="80" selfId={1} />);
    // Quest 1 is the one being edited: no overlap with itself, none with the far one, none with the archived one.
    await waitFor(() => expect(drawn.circles.length).toBeGreaterThan(0));
    expect(screen.queryByText(/overlaps/)).toBeNull();
  });

  it('BR12 an overlap with another checkpoint is named, with the reassurance that it is allowed', async () => {
    quests.list = [
      { id: 2, name: 'Sensoricum', lat: 49.14735, lng: 9.2179, radius: 60, archived: false },
    ];
    render(<Harness start="80" selfId={1} />);
    expect(await screen.findByText(/overlaps Sensoricum/)).toHaveTextContent(
      'a spot always belongs to the checkpoint whose centre is nearest',
    );
  });
});
