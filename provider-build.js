 let map;
        let markers = [];
        let infoWindow;
        let geocoder;
        let allProviders = [];
        let filteredProviders = [];

        // Parse CSV data (handles quoted fields properly)
        function parseCSV(csv) {
            const lines = csv.trim().split('\n');
            const headers = parseCSVLine(lines[0]);
            const data = [];

            for (let i = 1; i < lines.length; i++) {
                const values = parseCSVLine(lines[i]);
                const obj = {};
                
                headers.forEach((header, index) => {
                    obj[header] = values[index] || '';
                });
                
                data.push(obj);
            }
            
            return data;
        }

        // Parse a single CSV line handling quotes properly
        function parseCSVLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];
                
                if (char === '"') {
                    if (inQuotes && nextChar === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            
            result.push(current);
            return result;
        }

        // Initialize the map
        function initMap() {
            // Center on Rhode Island
            const riCenter = { lat: 41.7, lng: -71.5 };

            map = new google.maps.Map(document.getElementById('map'), {
                center: riCenter,
                zoom: 9,
                styles: [
                    {
                        featureType: 'poi',
                        elementType: 'labels',
                        stylers: [{ visibility: 'on' }]
                    }
                ]
            });

            infoWindow = new google.maps.InfoWindow();
            geocoder = new google.maps.Geocoder();

            // Load and parse CSV data
            loadProviders();
        }

        // Load providers from CSV
        function loadProviders() {
            document.getElementById('loading').classList.add('active');
            
            try {
                allProviders = parseCSV(csvData);
                
                // Populate filter dropdowns
                populateFilters();
                
                // Show all providers initially
                filteredProviders = allProviders;
                displayProviders(allProviders);
                addMarkersToMap(allProviders);
                
                document.getElementById('loading').classList.remove('active');
            } catch (error) {
                console.error('Error loading providers:', error);
                document.getElementById('loading').classList.remove('active');
                alert('Error loading provider data');
            }
        }

        // Populate filter checkboxes
        function populateFilters() {
            const specialties = new Set();

            allProviders.forEach(provider => {
                specialties.add(provider.Specialty);
            });

            // Populate specialty checkboxes
            const specialtyContainer = document.getElementById('specialtyCheckboxes');
            const sortedSpecialties = [...specialties].sort();
            
            sortedSpecialties.forEach(specialty => {
                const div = document.createElement('div');
                div.className = 'checkbox-group';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `specialty_${specialty.replace(/\s+/g, '_')}`;
                checkbox.value = specialty;
                checkbox.name = 'specialty';
                
                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.textContent = specialty;
                
                div.appendChild(checkbox);
                div.appendChild(label);
                specialtyContainer.appendChild(div);
            });
        }

        // Get selected specialties
        function getSelectedSpecialties() {
            const checkboxes = document.querySelectorAll('input[name="specialty"]:checked');
            return Array.from(checkboxes).map(cb => cb.value);
        }

        // Calculate distance between two lat/lng points in miles (Haversine formula)
        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 3959; // Earth's radius in miles
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // Search providers
        function searchProviders(event) {
            event.preventDefault();

            const nameQuery = document.getElementById('searchName').value.toLowerCase();
            const selectedSpecialties = getSelectedSpecialties();
            const zipQuery = document.getElementById('searchZip').value.trim();
            const radiusMiles = parseInt(document.getElementById('radiusSelect').value);
            const genderQuery = document.querySelector('input[name="gender"]:checked').value;
            const acceptingOnly = document.getElementById('acceptingPatients').checked;

            // If zip code is provided, geocode it first
            if (zipQuery) {
                document.getElementById('loading').classList.add('active');
                const geocoder = new google.maps.Geocoder();
                
                geocoder.geocode({ address: zipQuery + ', Rhode Island, USA' }, (results, status) => {
                    document.getElementById('loading').classList.remove('active');
                    
                    if (status === 'OK' && results[0]) {
                        const zipLocation = results[0].geometry.location;
                        const zipLat = zipLocation.lat();
                        const zipLng = zipLocation.lng();
                        
                        filterProvidersWithRadius(nameQuery, selectedSpecialties, genderQuery, acceptingOnly, zipLat, zipLng, radiusMiles);
                    } else {
                        alert('Could not find location for zip code: ' + zipQuery);
                        filterProvidersWithRadius(nameQuery, selectedSpecialties, genderQuery, acceptingOnly, null, null, radiusMiles);
                    }
                });
            } else {
                filterProvidersWithRadius(nameQuery, selectedSpecialties, genderQuery, acceptingOnly, null, null, radiusMiles);
            }
        }

        // Filter providers with optional radius search
        function filterProvidersWithRadius(nameQuery, selectedSpecialties, genderQuery, acceptingOnly, zipLat, zipLng, radiusMiles) {
            filteredProviders = allProviders.filter(provider => {
                const matchesName = !nameQuery || 
                    provider['First Name'].toLowerCase().includes(nameQuery) ||
                    provider['Last Name'].toLowerCase().includes(nameQuery);
                
                // If no specialties selected, show all. Otherwise, check if provider's specialty is in selected list
                const matchesSpecialty = selectedSpecialties.length === 0 || 
                    selectedSpecialties.includes(provider.Specialty);
                
                let matchesZip = true;
                if (zipLat !== null && zipLng !== null) {
                    const providerLat = parseFloat(provider['Practice:Latitude']);
                    const providerLng = parseFloat(provider['Practice:Longitude']);
                    
                    if (!isNaN(providerLat) && !isNaN(providerLng)) {
                        const distance = calculateDistance(zipLat, zipLng, providerLat, providerLng);
                        matchesZip = distance <= radiusMiles;
                    } else {
                        matchesZip = false;
                    }
                }
                
                const matchesGender = !genderQuery || 
                    provider.Gender === genderQuery;
                
                const matchesAccepting = !acceptingOnly || 
                    provider['Accepting New Patients'] === 'True';

                return matchesName && matchesSpecialty && matchesZip && matchesGender && matchesAccepting;
            });

            displayProviders(filteredProviders);
            clearMarkers();
            addMarkersToMap(filteredProviders);
            
            // If zip search was performed, center map on the zip code
            if (zipLat !== null && zipLng !== null) {
                map.setCenter({ lat: zipLat, lng: zipLng });
                map.setZoom(11);
                
                // Add a circle to show the radius
                if (window.searchCircle) {
                    window.searchCircle.setMap(null);
                }
                window.searchCircle = new google.maps.Circle({
                    map: map,
                    center: { lat: zipLat, lng: zipLng },
                    radius: radiusMiles * 1609.34, // Convert miles to meters
                    fillColor: '#667eea',
                    fillOpacity: 0.1,
                    strokeColor: '#667eea',
                    strokeOpacity: 0.4,
                    strokeWeight: 2
                });
            } else {
                // Remove search circle if no zip search
                if (window.searchCircle) {
                    window.searchCircle.setMap(null);
                    window.searchCircle = null;
                }
            }
        }

        // Clear search
        function clearSearch() {
            document.getElementById('searchForm').reset();
            
            // Uncheck all specialty checkboxes
            const checkboxes = document.querySelectorAll('input[name="specialty"]');
            checkboxes.forEach(cb => cb.checked = false);
            
            filteredProviders = allProviders;
            displayProviders(allProviders);
            clearMarkers();
            addMarkersToMap(allProviders);
            
            // Remove search circle if it exists
            if (window.searchCircle) {
                window.searchCircle.setMap(null);
                window.searchCircle = null;
            }
            
            // Reset map view to Rhode Island
            map.setCenter({ lat: 41.7, lng: -71.5 });
            map.setZoom(9);
        }

        // Display providers in sidebar
        function displayProviders(providers) {
            const resultsDiv = document.getElementById('providerResults');
            const resultsCount = document.getElementById('resultsCount');
            
            resultsCount.textContent = `${providers.length} provider${providers.length !== 1 ? 's' : ''}`;

            if (providers.length === 0) {
                resultsDiv.innerHTML = '<div class="no-results">No providers found matching your criteria</div>';
                return;
            }

            resultsDiv.innerHTML = providers.map(provider => `
                <div class="provider-card">
                    <div class="provider-name">
                        ${provider['First Name']} ${provider['Last Name']}, ${provider.Degree}
                    <br /><span class="provider-specialty">${provider.Specialty}</span>
                    </div>
                    
                    <div class="provider-info">
                        <strong>${provider.Practice}</strong><br>
                        ${provider['Practice:Address']}${provider['Practice:Address 2'] ? ', ' + provider['Practice:Address 2'] : ''}<br>
                        ${provider['Practice:City']}, RI ${provider['Practice:Zip']}
                    </div>
                    <div class="provider-buttons">
                    <button
  type="button"
  class="btn btn-secondary call-btn"
  onclick="callProvider('${provider['Practice:Main Line']}')"
>
  <span class="providers-list-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-phone" viewBox="0 0 16 16"><path d="M11 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM5 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z"></path><path d="M8 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2"></path></svg></span> ${provider['Practice:Main Line']}
</button>

<button
  type="button"
  class="btn btn-secondary schedule-btn"
  onclick="scheduleAppointment()"
>
  <span class="providers-list-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-calendar2-week" viewBox="0 0 16 16"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M2 2a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"></path><path d="M2.5 4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5zM11 7.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm-5 3a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z"></path></svg></span>️ Schedule appointment
</button>
                    </div>
                    <span class="badge ${provider['Accepting New Patients'] === 'True' ? 'badge-accepting' : 'badge-not-accepting'}">
                        ${provider['Accepting New Patients'] === 'True' ? '✓ Accepting New Patients' : '✗ Not accepting new patients'}
                    </span>
                </div>
            `).join('');
        }

        // Add markers to map
        function addMarkersToMap(providers) {
            let acceptingCount = 0;

            providers.forEach(provider => {
                const lat = parseFloat(provider['Practice:Latitude']);
                const lng = parseFloat(provider['Practice:Longitude']);

                if (isNaN(lat) || isNaN(lng)) return;

                if (provider['Accepting New Patients'] === 'True') {
                    acceptingCount++;
                }

                const marker = new google.maps.Marker({
                    map: map,
                    position: { lat, lng },
                    title: `${provider['First Name']} ${provider['Last Name']}`,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: provider['Accepting New Patients'] === 'True' ? '#4CAF50' : '#FF5722',
                        fillOpacity: 0.9,
                        strokeColor: '#ffffff',
                        strokeWeight: 2
                    },
                    providerId: provider.ID
                });

                marker.addListener('click', () => {
                    showProviderInfo(provider, marker);
                });

                markers.push(marker);
            });

            // Update stats
            document.getElementById('markerCount').textContent = markers.length;
            document.getElementById('acceptingCount').textContent = acceptingCount;

            // Fit bounds if there are markers
            if (markers.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                markers.forEach(marker => bounds.extend(marker.getPosition()));
                map.fitBounds(bounds);
            }
        }

        // Clear all markers
        function clearMarkers() {
            markers.forEach(marker => marker.setMap(null));
            markers = [];
            document.getElementById('markerCount').textContent = '0';
            document.getElementById('acceptingCount').textContent = '0';
        }

        // Show provider info window
        function showProviderInfo(provider, marker) {
            const content = `
                <div style="padding: 10px; max-width: 300px;">
                    <h3 style="margin: 0 0 10px 0; color: #000000;">
                        ${provider['First Name']} ${provider['Last Name']}, ${provider.Degree}
                    </h3>
                    <p style="margin: 5px 0; font-weight: 600; color: #667eea;">
                        ${provider.Specialty}
                    </p>
                    <p style="margin: 8px 0; font-weight: bold;">
                        ${provider.Practice}
                    </p>
                    <p style="margin: 5px 0; line-height: 1.5;">
                        ${provider['Practice:Address']}${provider['Practice:Address 2'] ? ', ' + provider['Practice:Address 2'] : ''}<br>
                        ${provider['Practice:City']}, RI ${provider['Practice:Zip']}
                    </p>
                    <p style="margin: 8px 0;">
                        <a href="${provider['Practice:Main Line']}" style="text-decoration:none">📞 ${provider['Practice:Main Line']}</a>
                        <!-- <br>📠 ${provider['Practice:Fax']} -->
                    </p>
                    <p style="margin: 8px 0;">
                        <span style="display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; 
                            background: ${provider['Accepting New Patients'] === 'True' ? '#d4edda' : '#f8d7da'}; 
                            color: ${provider['Accepting New Patients'] === 'True' ? '#155724' : '#721c24'};">
                            ${provider['Accepting New Patients'] === 'True' ? '✓ Accepting New Patients' : '✗ Not Accepting New Patients'}
                        </span>
                    </p>
                </div>
            `;

            infoWindow.setContent(content);
            infoWindow.open(map, marker);
        }

        // Focus on specific provider
        function focusProvider(providerId) {
            const marker = markers.find(m => m.providerId === providerId);
            if (marker) {
                map.setCenter(marker.getPosition());
                map.setZoom(15);
                
                const provider = allProviders.find(p => p.ID === providerId);
                if (provider) {
                    showProviderInfo(provider, marker);
                }
            }
        }

        // Show loading initially
        document.getElementById('loading').classList.add('active');
