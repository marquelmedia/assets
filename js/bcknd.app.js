let specifications = '';

fetch('https://marquelmedia.github.io/assets/js/bcknd.spec.json')
  .then(response => response.json())
  .then(data => {
    const slugs = [];

    for (const [endpoint, meta] of Object.entries(data.api)) {
      if (endpoint == location.href.split('/')[3]) {
        slugs.push({
          doc: endpoint,
          tags: Object.entries(meta.tags),
          desc: meta.title,
        });
      }
    }

    slugs.forEach((endpoint) => {
      for (const [key, spec] of Object.entries(endpoint.tags)) {
        //if (!spec[0].match(/_/))
        specifications += `
          <option value="#/${spec[0]}">
            ${spec[1].title}
          </option>
        `;
      }
    });

    setTimeout(() => {
      // Create a new link element
      const link = document.createElement('link');

      // Set the attributes of the link element
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap';

      // Append the link element to the head
      document.head.appendChild(link);

document.querySelector('.topbar-wrapper').innerHTML = `
        <h2>BCKND<span style="font-family: sans-serif;">.</span></h2>
        <small></small>
        <label>
          <div class="">
            <select aria-label="Specification" class="specifications">
              <option value="" disabled selected>Explore...</option>
              ${specifications}
            </select>
          </div>
        </label>
        <!--
        document.querySelector('.info hgroup.main span').innerHTML;
        -->
      `;
      document.querySelector('body').innerHTML += `
        <footer>
          <a href="https://marquel.media" target="_blank">MARQUELMEDIA™</a>
        </footer>
      `;
      setTimeout(() => {
        let hash = location.hash.split('/')[1] ?? '';
        document.querySelector('.specifications').value = `${hash.length ? `#/${hash}` : ''}`;
        document.querySelector('.specifications').onchange = (e) => {
          /*document.querySelector('.swagger-container > div.swagger-ui').innerHTML = `
            <div class='loading-container'><div class='loading'></div></div>
          `;*/
          const top = document.getElementById(
            'operations-tag-' + document.querySelector('.specifications').value.split('/')[1]
          ).offsetTop;
          window.scrollTo(0, top);
        };
        document.querySelectorAll('a.nostyle').forEach((anchor) => {
          anchor.onclick = (e) => {
            window.scrollTo(0, anchor.offsetTop - 15);
          };
        });
        document.querySelectorAll('.opblock-tag').forEach((tag) => {
          if (tag.id.match(/_/)) {
            let copy = `<h3 class="opblock-nested" id="${tag.id}">${tag.innerHTML}</h3>`;
            let section = document.querySelector( `#${tag.id}` ).parentElement;
            tag.remove();
            section.insertAdjacentHTML('afterBegin', copy);
            section.style.marginTop = '0px';
            section.style.marginLeft = '25px';
            section.style.paddingLeft = '15px';
            section.style.borderLeft = '1px dashed #ccc';
            section.querySelectorAll('.authorization__btn').forEach((lock) => {
              lock.style.left = '46px';
            });
          } else {
            let copy = `<h3 class="opblock-tag" id="${tag.id}">${tag.innerHTML}</h3>`;
            let section = document.querySelector( `#${tag.id}` ).parentElement;
            tag.remove();
            section.insertAdjacentHTML('afterBegin', copy);
          }
        });
      }, 100);
    }, 500);

  })
  .catch(error => console.error('Error:', error));

